import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../api/postgres_api_client.dart';

class MobileVersionInfo {
  final String latestVersion;
  final int buildNumber;
  final String minSupportedVersion;
  final String downloadUrl;
  final String releaseNotes;
  final bool mandatory;

  MobileVersionInfo({
    required this.latestVersion,
    required this.buildNumber,
    required this.minSupportedVersion,
    required this.downloadUrl,
    required this.releaseNotes,
    required this.mandatory,
  });

  factory MobileVersionInfo.fromMap(Map<String, dynamic> map) {
    return MobileVersionInfo(
      latestVersion: map['latestVersion']?.toString() ?? '1.0.0',
      buildNumber: (map['buildNumber'] as num?)?.toInt() ?? 1,
      minSupportedVersion: map['minSupportedVersion']?.toString() ?? '1.0.0',
      downloadUrl: map['downloadUrl']?.toString() ?? '',
      releaseNotes: map['releaseNotes']?.toString() ?? '',
      mandatory: map['mandatory'] == true,
    );
  }
}

class OtaUpdateService {
  static const String currentAppVersion = '1.0.0';

  static Future<MobileVersionInfo?> checkForUpdate() async {
    try {
      final baseUrl = PostgresApiClient().baseUrl;
      final url = Uri.parse('$baseUrl/mobile/version');
      final res = await http.get(url).timeout(const Duration(seconds: 5));

      if (res.statusCode == 200) {
        final body = jsonDecode(res.body);
        if (body['success'] == true && body['data'] != null) {
          final info = MobileVersionInfo.fromMap(body['data']);
          if (_isNewer(info.latestVersion, currentAppVersion)) {
            return info;
          }
        }
      }
      return null;
    } catch (e) {
      debugPrint('[OtaUpdateService] Failed to check for updates: $e');
      return null;
    }
  }

  static bool _isNewer(String latest, String current) {
    try {
      final lParts = latest.split('.').map(int.parse).toList();
      final cParts = current.split('.').map(int.parse).toList();
      for (int i = 0; i < lParts.length && i < cParts.length; i++) {
        if (lParts[i] > cParts[i]) return true;
        if (lParts[i] < cParts[i]) return false;
      }
      return lParts.length > cParts.length;
    } catch (_) {
      return latest != current;
    }
  }

  static void promptUpdate(BuildContext context, MobileVersionInfo info) {
    showDialog(
      context: context,
      barrierDismissible: !info.mandatory,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: Color(0xFF38BDF8), width: 1.2),
        ),
        title: Row(
          children: [
            const Icon(Icons.system_update, color: Color(0xFF38BDF8)),
            const SizedBox(width: 8),
            Text(
              'Update Available (v${info.latestVersion})',
              style: const TextStyle(color: Colors.white, fontSize: 18),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'A new build of Sensible AI CRM Enterprise is available with enhanced Dual-SIM call tracking and stability updates.',
              style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 13),
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                info.releaseNotes,
                style: const TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 12,
                  fontFamily: 'monospace',
                ),
              ),
            ),
          ],
        ),
        actions: [
          if (!info.mandatory)
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Later', style: TextStyle(color: Colors.grey)),
            ),
          ElevatedButton.icon(
            onPressed: () {
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  backgroundColor: const Color(0xFF0284C7),
                  content: Text('Downloading update from ${info.downloadUrl}...'),
                ),
              );
            },
            icon: const Icon(Icons.download, size: 16),
            label: const Text('Download & Update'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0284C7),
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}
