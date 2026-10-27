import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_overlay_window/flutter_overlay_window.dart';

@pragma("vm:entry-point")
void overlayMain() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: CallerIdOverlay(),
    ),
  );
}

class CallerIdOverlay extends StatefulWidget {
  const CallerIdOverlay({super.key});

  @override
  State<CallerIdOverlay> createState() => _CallerIdOverlayState();
}

class _CallerIdOverlayState extends State<CallerIdOverlay> {
  StreamSubscription? _overlaySub;

  String _leadName = 'Incoming Customer';
  String _companyName = 'Sensible CRM Lead';
  String _leadStage = 'Qualified';
  String _phone = '';
  String _simInfo = 'SIM 1 (Work)';
  String _note = 'Loading CRM relationship insights...';
  String _dealValue = '';

  @override
  void initState() {
    super.initState();
    _overlaySub = FlutterOverlayWindow.overlayListener.listen((dynamic data) {
      if (data == null) return;
      try {
        Map<String, dynamic> map = {};
        if (data is String) {
          map = jsonDecode(data);
        } else if (data is Map) {
          map = Map<String, dynamic>.from(data);
        }

        setState(() {
          _leadName = map['name'] ?? map['leadName'] ?? _leadName;
          _companyName = map['company'] ?? map['companyName'] ?? _companyName;
          _leadStage = map['stage'] ?? map['leadStage'] ?? _leadStage;
          _phone = map['phone'] ?? _phone;
          _simInfo = map['simInfo'] ?? _simInfo;
          _note = map['note'] ?? map['lastNote'] ?? _note;
          if (map['dealValue'] != null) {
            final val = map['dealValue'];
            _dealValue = '₹${val.toString()}';
          }
        });
      } catch (e) {
        debugPrint('[CallerIdOverlay] Error parsing overlay data: $e');
      }
    });
  }

  @override
  void dispose() {
    _overlaySub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Center(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFF0F172A), // Dark slate
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.6),
                blurRadius: 24,
                offset: const Offset(0, 10),
              ),
            ],
            border: Border.all(color: const Color(0xFF38BDF8), width: 1.8),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header: Icon + Customer Name + Stage Badge
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0284C7).withValues(alpha: 0.25),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.person_pin,
                      color: Color(0xFF38BDF8),
                      size: 26,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _leadName,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          _companyName,
                          style: const TextStyle(
                            color: Color(0xFF94A3B8),
                            fontSize: 13,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFF10B981).withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFF10B981), width: 0.8),
                    ),
                    child: Text(
                      _leadStage.toUpperCase(),
                      style: const TextStyle(
                        color: Color(0xFF34D399),
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              const Divider(color: Color(0xFF334155), height: 1),
              const SizedBox(height: 10),

              // Phone & SIM Card info
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    _phone.isNotEmpty ? _phone : 'Calling...',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Row(
                    children: [
                      const Icon(Icons.sim_card,
                          size: 14, color: Color(0xFF38BDF8)),
                      const SizedBox(width: 4),
                      Text(
                        _simInfo,
                        style: const TextStyle(
                          color: Color(0xFF38BDF8),
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              if (_dealValue.isNotEmpty) ...[
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.monetization_on_outlined,
                        size: 14, color: Color(0xFFFBBF24)),
                    const SizedBox(width: 4),
                    Text(
                      'Pipeline Value: $_dealValue',
                      style: const TextStyle(
                        color: Color(0xFFFBBF24),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 10),

              // AI CRM Note preview
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFF334155)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.auto_awesome,
                        size: 14, color: Color(0xFFA855F7)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        _note,
                        style: const TextStyle(
                          color: Color(0xFFCBD5E1),
                          fontSize: 12,
                          height: 1.3,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Footer dismiss action
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton.icon(
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      backgroundColor: const Color(0xFF334155),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    onPressed: () async {
                      await FlutterOverlayWindow.closeOverlay();
                    },
                    icon: const Icon(Icons.close,
                        size: 14, color: Color(0xFF94A3B8)),
                    label: const Text(
                      'Dismiss',
                      style:
                          TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
