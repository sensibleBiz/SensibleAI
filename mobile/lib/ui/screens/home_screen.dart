import 'package:flutter/material.dart';
import 'package:flutter_overlay_window/flutter_overlay_window.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../core/models/call_entry.dart';
import '../../core/telephony/call_log_service.dart';
import '../../core/telephony/sim_service.dart';
import '../../core/api/postgres_api_client.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final CallLogService _callLogService = CallLogService();
  final SimService _simService = SimService();
  final PostgresApiClient _apiClient = PostgresApiClient();

  List<CallEntry> _calls = [];
  bool _isLoading = false;
  String _simSummary = 'Detecting SIMs...';

  @override
  void initState() {
    super.initState();
    _initApp();
  }

  Future<void> _initApp() async {
    setState(() => _isLoading = true);
    await _apiClient.init();
    await _checkPermissionsAndLoad();
    setState(() => _isLoading = false);
  }

  Future<void> _checkPermissionsAndLoad() async {
    // 1. Load SIM profiles
    final sims = await _simService.loadSimCards();
    if (sims.isNotEmpty) {
      _simSummary = sims.map((s) => s.displayName).join(' • ');
    } else {
      _simSummary = 'Single SIM / Default';
    }

    // 2. Fetch calls
    final calls = await _callLogService.fetchRecentCalls(limit: 30);
    setState(() {
      _calls = calls;
    });
  }

  Future<void> _requestPermissions() async {
    await [
      Permission.phone,
      Permission.contacts,
    ].request();

    final overlayGranted = await FlutterOverlayWindow.isPermissionGranted();
    if (overlayGranted != true) {
      await FlutterOverlayWindow.requestPermission();
    }

    await _checkPermissionsAndLoad();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Permissions updated successfully!')),
      );
    }
  }

  Future<void> _triggerManualSync() async {
    setState(() => _isLoading = true);
    final count = await _callLogService.flushPendingCalls();
    await _checkPermissionsAndLoad();
    setState(() => _isLoading = false);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Synced $count calls to PostgreSQL database!')),
      );
    }
  }

  Future<void> _testPopup() async {
    final hasPerm = await FlutterOverlayWindow.isPermissionGranted();
    if (hasPerm != true) {
      await FlutterOverlayWindow.requestPermission();
      return;
    }

    await FlutterOverlayWindow.showOverlay(
      height: 380,
      width: 320,
      alignment: OverlayAlignment.center,
      enableDrag: true,
      flag: OverlayFlag.focusPointer,
      visibility: NotificationVisibility.visibilityPublic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final syncedCount = _calls.where((c) => c.synced).length;
    final pendingCount = _calls.length - syncedCount;

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Sensible AI CRM Mobile',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 18,
              ),
            ),
            Text(
              'PostgreSQL Unified Suite • Dual-SIM Telephony',
              style: TextStyle(
                color: Color(0xFF38BDF8),
                fontSize: 12,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.sync, color: Color(0xFF38BDF8)),
            tooltip: 'Sync to PostgreSQL',
            onPressed: _triggerManualSync,
          ),
          IconButton(
            icon: const Icon(Icons.security, color: Colors.white70),
            tooltip: 'Check Permissions',
            onPressed: _requestPermissions,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF38BDF8)))
          : RefreshIndicator(
              onRefresh: _checkPermissionsAndLoad,
              color: const Color(0xFF38BDF8),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // SIM Status Card
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E293B),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFF334155)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.sim_card, color: Color(0xFF38BDF8), size: 28),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Active Cellular Hardware',
                                style: TextStyle(color: Colors.grey, fontSize: 12),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                _simSummary,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        ElevatedButton.icon(
                          onPressed: _testPopup,
                          icon: const Icon(Icons.visibility, size: 16),
                          label: const Text('Test Pop-up'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF0284C7),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            textStyle: const TextStyle(fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Metrics Cards
                  Row(
                    children: [
                      Expanded(
                        child: _buildMetricCard(
                          title: 'Logged Calls',
                          value: '${_calls.length}',
                          icon: Icons.phone,
                          color: const Color(0xFF38BDF8),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _buildMetricCard(
                          title: 'PG Synced',
                          value: '$syncedCount',
                          icon: Icons.cloud_done,
                          color: const Color(0xFF34D399),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _buildMetricCard(
                          title: 'Pending',
                          value: '$pendingCount',
                          icon: Icons.cloud_queue,
                          color: const Color(0xFFFBBF24),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 20),

                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Recent Telephony Activity',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      TextButton.icon(
                        onPressed: _triggerManualSync,
                        icon: const Icon(Icons.refresh, size: 16),
                        label: const Text('Flush to DB'),
                        style: TextButton.styleFrom(
                          foregroundColor: const Color(0xFF38BDF8),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 8),

                  if (_calls.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(32),
                      alignment: Alignment.center,
                      child: Column(
                        children: [
                          Icon(Icons.call_end, size: 48, color: Colors.grey[600]),
                          const SizedBox(height: 12),
                          Text(
                            'No call logs detected on this device yet.',
                            style: TextStyle(color: Colors.grey[400]),
                          ),
                          const SizedBox(height: 12),
                          ElevatedButton(
                            onPressed: _requestPermissions,
                            child: const Text('Grant Phone Permissions'),
                          ),
                        ],
                      ),
                    )
                  else
                    ..._calls.map((call) => _buildCallCard(call)),
                ],
              ),
            ),
    );
  }

  Widget _buildMetricCard({
    required String title,
    required String value,
    required IconData icon,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 8),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          Text(
            title,
            style: TextStyle(color: Colors.grey[400], fontSize: 11),
          ),
        ],
      ),
    );
  }

  Widget _buildCallCard(CallEntry call) {
    IconData dirIcon;
    Color dirColor;
    switch (call.direction) {
      case CallDirection.incoming:
        dirIcon = Icons.call_received;
        dirColor = const Color(0xFF34D399);
        break;
      case CallDirection.outgoing:
        dirIcon = Icons.call_made;
        dirColor = const Color(0xFF38BDF8);
        break;
      case CallDirection.missed:
        dirIcon = Icons.call_missed;
        dirColor = const Color(0xFFF87171);
        break;
      case CallDirection.rejected:
        dirIcon = Icons.call_end;
        dirColor = const Color(0xFFFB923C);
        break;
    }

    final durationFormatted = call.durationSeconds > 0
        ? '${call.durationSeconds ~/ 60}m ${call.durationSeconds % 60}s'
        : '0s';

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: dirColor.withValues(alpha: 0.15),
            child: Icon(dirIcon, color: dirColor, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  call.name.isNotEmpty ? call.name : call.number,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    if (call.name.isNotEmpty) ...[
                      Text(
                        call.number,
                        style: TextStyle(color: Colors.grey[400], fontSize: 12),
                      ),
                      const Text(' • ', style: TextStyle(color: Colors.grey, fontSize: 12)),
                    ],
                    Text(
                      durationFormatted,
                      style: TextStyle(color: Colors.grey[400], fontSize: 12),
                    ),
                    const Text(' • ', style: TextStyle(color: Colors.grey, fontSize: 12)),
                    Text(
                      call.simLabel ?? 'SIM 1',
                      style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 12),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: call.synced
                  ? const Color(0xFF065F46).withValues(alpha: 0.3)
                  : const Color(0xFF78350F).withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(
                color: call.synced ? const Color(0xFF34D399) : const Color(0xFFFBBF24),
                width: 0.8,
              ),
            ),
            child: Text(
              call.synced ? 'Synced' : 'Pending',
              style: TextStyle(
                color: call.synced ? const Color(0xFF34D399) : const Color(0xFFFBBF24),
                fontSize: 10,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

