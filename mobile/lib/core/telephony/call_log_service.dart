import 'dart:convert';
import 'package:call_log/call_log.dart' as cl;
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/call_entry.dart';
import '../api/postgres_api_client.dart';
import 'sim_service.dart';

class CallLogService {
  static final CallLogService _instance = CallLogService._internal();
  factory CallLogService() => _instance;
  CallLogService._internal();

  final PostgresApiClient _apiClient = PostgresApiClient();
  final SimService _simService = SimService();
  static const String _cachedLogsKey = 'cached_call_logs_v1';

  /// Fetches recent phone calls from Android CallLog provider
  Future<List<CallEntry>> fetchRecentCalls({int limit = 50}) async {
    try {
      final entries = await cl.CallLog.query();
      final list = <CallEntry>[];

      for (final raw in entries.take(limit)) {
        final direction = _mapCallType(raw.callType);
        final simProfile = _resolveSimCard(raw.simDisplayName, raw.phoneAccountId);

        list.add(CallEntry(
          id: '${raw.timestamp}_${raw.number}',
          number: raw.number ?? '',
          name: raw.name ?? '',
          direction: direction,
          durationSeconds: raw.duration ?? 0,
          timestamp: DateTime.fromMillisecondsSinceEpoch(raw.timestamp ?? DateTime.now().millisecondsSinceEpoch),
          simLabel: simProfile?.displayName ?? raw.simDisplayName ?? 'SIM 1',
          simPhoneNumber: simProfile?.phoneNumber,
          subscriptionId: simProfile?.subscriptionId ?? raw.phoneAccountId,
          slotIndex: simProfile?.slotIndex,
          synced: false,
        ));
      }
      return list;
    } catch (e) {
      debugPrint('[CallLogService] Error querying system call logs: $e');
      return await getLocalCachedLogs();
    }
  }

  /// Finds and syncs the most recent call after a call finishes
  Future<CallEntry?> syncLatestCall() async {
    final calls = await fetchRecentCalls(limit: 5);
    if (calls.isEmpty) return null;

    final latest = calls.first;
    final success = await _apiClient.uploadCallLog(latest);
    final updated = latest.copyWith(synced: success);

    await saveCallLocally(updated);
    return updated;
  }

  /// Saves a call record to device offline storage
  Future<void> saveCallLocally(CallEntry entry) async {
    final prefs = await SharedPreferences.getInstance();
    final cached = await getLocalCachedLogs();
    
    // Replace if exists, else insert at beginning
    final index = cached.indexWhere((c) => c.id == entry.id);
    if (index >= 0) {
      cached[index] = entry;
    } else {
      cached.insert(0, entry);
    }

    final rawJson = jsonEncode(cached.take(100).map((c) => c.toMap()).toList());
    await prefs.setString(_cachedLogsKey, rawJson);
  }

  /// Retrieves cached logs from device storage
  Future<List<CallEntry>> getLocalCachedLogs() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_cachedLogsKey);
      if (raw == null || raw.isEmpty) return [];

      final decoded = jsonDecode(raw) as List;
      return decoded.map((item) => CallEntry.fromMap(Map<String, dynamic>.from(item))).toList();
    } catch (e) {
      return [];
    }
  }

  /// Flushes any pending offline calls to PostgreSQL
  Future<int> flushPendingCalls() async {
    final logs = await getLocalCachedLogs();
    int syncedCount = 0;

    for (int i = 0; i < logs.length; i++) {
      if (!logs[i].synced) {
        final ok = await _apiClient.uploadCallLog(logs[i]);
        if (ok) {
          logs[i] = logs[i].copyWith(synced: true);
          syncedCount++;
        }
      }
    }

    if (syncedCount > 0) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cachedLogsKey, jsonEncode(logs.map((c) => c.toMap()).toList()));
    }
    return syncedCount;
  }

  CallDirection _mapCallType(cl.CallType? type) {
    switch (type) {
      case cl.CallType.incoming:
        return CallDirection.incoming;
      case cl.CallType.outgoing:
        return CallDirection.outgoing;
      case cl.CallType.missed:
        return CallDirection.missed;
      case cl.CallType.rejected:
      case cl.CallType.blocked:
        return CallDirection.rejected;
      default:
        return CallDirection.incoming;
    }
  }

  SimCardInfo? _resolveSimCard(String? simDisplayName, String? phoneAccountId) {
    if (phoneAccountId != null) {
      final bySub = _simService.getSimBySubscriptionId(phoneAccountId);
      if (bySub != null) return bySub;
    }
    if (simDisplayName != null) {
      for (final sim in _simService.simCards) {
        if (simDisplayName.toLowerCase().contains(sim.carrierName.toLowerCase())) {
          return sim;
        }
      }
    }
    return null;
  }
}

