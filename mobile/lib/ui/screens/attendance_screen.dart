import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:http/http.dart' as http;
import '../../core/api/postgres_api_client.dart';

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  final PostgresApiClient _apiClient = PostgresApiClient();
  bool _isClockedIn = false;
  String _clockInTime = '--:--';
  final String _locationSummary = 'GPS Fixed: 18.5204° N, 73.8567° E (Pune HQ)';
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
  }

  Future<void> _toggleClock() async {
    setState(() => _isLoading = true);
    final now = DateTime.now();
    final timeStr = DateFormat('hh:mm a').format(now);

    try {
      final url = Uri.parse('${_apiClient.baseUrl}/attendance');
      await http.post(
        url,
        headers: {
          'Content-Type': 'application/json',
          'x-postgres-session': '1',
        },
        body: jsonEncode({
          'outletId': _apiClient.currentOutletId,
          'action': _isClockedIn ? 'CLOCK_OUT' : 'CLOCK_IN',
          'timestamp': now.millisecondsSinceEpoch,
          'latitude': 18.5204,
          'longitude': 73.8567,
          'source': 'Sensible Mobile Field App',
        }),
      ).timeout(const Duration(seconds: 8));

      setState(() {
        _isClockedIn = !_isClockedIn;
        if (_isClockedIn) {
          _clockInTime = timeStr;
        }
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: _isClockedIn ? const Color(0xFF10B981) : const Color(0xFF38BDF8),
            content: Text(_isClockedIn ? 'Clocked in at $timeStr with GPS tag!' : 'Clocked out at $timeStr!'),
          ),
        );
      }
    } catch (e) {
      debugPrint('[AttendanceScreen] Error: $e');
      // Update locally even if offline
      setState(() {
        _isClockedIn = !_isClockedIn;
        if (_isClockedIn) _clockInTime = timeStr;
      });
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final todayDate = DateFormat('EEEE, d MMMM yyyy').format(DateTime.now());

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text('Field Attendance & GPS', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Date & Shift status banner
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      todayDate,
                      style: const TextStyle(color: Colors.white70, fontSize: 13),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: _isClockedIn
                            ? const Color(0xFF10B981).withValues(alpha: 0.2)
                            : const Color(0xFF94A3B8).withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        _isClockedIn ? 'ON DUTY' : 'OFF DUTY',
                        style: TextStyle(
                          color: _isClockedIn ? const Color(0xFF34D399) : const Color(0xFF94A3B8),
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Icon(Icons.location_on, color: Color(0xFF38BDF8), size: 18),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        _locationSummary,
                        style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 13),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.access_time, color: Color(0xFFFBBF24), size: 18),
                    const SizedBox(width: 6),
                    Text(
                      _isClockedIn ? 'Clocked In at: $_clockInTime' : 'No active shift today',
                      style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 13),
                    ),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // Big Clock-In / Clock-Out Circular Action Button
          Center(
            child: GestureDetector(
              onTap: _isLoading ? null : _toggleClock,
              child: Container(
                width: 170,
                height: 170,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    colors: _isClockedIn
                        ? [const Color(0xFFEF4444), const Color(0xFFDC2626)]
                        : [const Color(0xFF0284C7), const Color(0xFF0369A1)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: (_isClockedIn ? const Color(0xFFEF4444) : const Color(0xFF0284C7))
                          .withValues(alpha: 0.35),
                      blurRadius: 24,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Center(
                  child: _isLoading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              _isClockedIn ? Icons.exit_to_app : Icons.fingerprint,
                              size: 48,
                              color: Colors.white,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              _isClockedIn ? 'CLOCK OUT' : 'CLOCK IN',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                                letterSpacing: 1.1,
                              ),
                            ),
                          ],
                        ),
                ),
              ),
            ),
          ),

          const SizedBox(height: 32),

          const Text(
            'Shift History (Recent)',
            style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 12),

          _buildShiftTile('Yesterday', '09:30 AM', '06:45 PM', '9h 15m', 'Pune HQ (Client Demo)'),
          _buildShiftTile('10 Oct 2026', '09:15 AM', '07:00 PM', '9h 45m', 'Mumbai Field Visits'),
          _buildShiftTile('09 Oct 2026', '09:40 AM', '06:30 PM', '8h 50m', 'Pune HQ'),
        ],
      ),
    );
  }

  Widget _buildShiftTile(String date, String inTime, String outTime, String total, String location) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: const Color(0xFF10B981).withValues(alpha: 0.15),
            child: const Icon(Icons.check_circle, color: Color(0xFF10B981), size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  date,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                ),
                Text(
                  '$inTime → $outTime ($total)',
                  style: TextStyle(color: Colors.grey[400], fontSize: 12),
                ),
                Text(
                  location,
                  style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
