import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:phone_state/phone_state.dart';
import 'package:flutter_overlay_window/flutter_overlay_window.dart';
import '../api/postgres_api_client.dart';
import '../cache/caller_id_cache_service.dart';
import 'call_log_service.dart';

class PhoneStateWatcher {
  static final PhoneStateWatcher _instance = PhoneStateWatcher._internal();
  factory PhoneStateWatcher() => _instance;
  PhoneStateWatcher._internal();

  StreamSubscription? _sub;
  final PostgresApiClient _apiClient = PostgresApiClient();
  final CallLogService _callLogService = CallLogService();
  final CallerIdCacheService _cacheService = CallerIdCacheService();
  bool _isProcessingEnd = false;
  String? _activeRingingLeadId;

  Future<void> start() async {
    await _cacheService.init();
    _sub?.cancel();
    _sub = PhoneState.stream.listen((status) async {
      debugPrint('[PhoneStateWatcher] Status: ${status.status}, Number: ${status.number}');

      if (status.status == PhoneStateStatus.CALL_INCOMING) {
        await _handleIncomingCall(status.number ?? '');
      } else if (status.status == PhoneStateStatus.CALL_ENDED) {
        await _handleCallEnded(status.number ?? '');
      }
    });
  }

  Future<void> _handleIncomingCall(String phoneNumber) async {
    if (phoneNumber.isEmpty) return;

    bool overlayShown = false;

    // 1. Instant 0ms Local Cache Check
    final cached = _cacheService.lookup(phoneNumber);
    if (cached != null) {
      final hasPerm = await FlutterOverlayWindow.isPermissionGranted();
      if (hasPerm == true) {
        await FlutterOverlayWindow.showOverlay(
          height: 380,
          width: 340,
          alignment: OverlayAlignment.center,
          enableDrag: true,
          flag: OverlayFlag.focusPointer,
          visibility: NotificationVisibility.visibilityPublic,
        );
        overlayShown = true;
        await FlutterOverlayWindow.shareData({
          'name': cached.name,
          'company': cached.company,
          'stage': cached.stage,
          'phone': phoneNumber,
          'simInfo': 'SIM 1 (Active)',
          'note': cached.lastNote ?? 'Recent lead in Sensible AI CRM',
          'dealValue': cached.dealValue > 0 ? cached.dealValue : null,
        });
        debugPrint('[PhoneStateWatcher] Instant offline Caller ID rendered from cache');
      }
    }

    // 2. Asynchronous Network Sync with PostgreSQL Core
    try {
      final lead = await _apiClient.lookupLeadByPhone(phoneNumber);
      if (lead != null) {
        _activeRingingLeadId = lead['id'];
        await _apiClient.setLeadRinging(_activeRingingLeadId!, true);

        // Update local cache
        await _cacheService.putContact(CachedLeadContact(
          leadId: lead['id'] ?? '',
          name: lead['name'] ?? lead['customer_name'] ?? 'Known Customer',
          company: lead['company'] ?? lead['business_name'] ?? 'Sensible CRM',
          phone: phoneNumber,
          stage: lead['stage'] ?? 'Follow-up',
          dealValue: 0.0,
          lastNote: lead['comments'] ?? lead['notes'],
        ));

        // If overlay wasn't shown yet (cache miss), show it now; otherwise update data
        final hasPerm = await FlutterOverlayWindow.isPermissionGranted();
        if (hasPerm == true) {
          if (!overlayShown) {
            await FlutterOverlayWindow.showOverlay(
              height: 380,
              width: 340,
              alignment: OverlayAlignment.center,
              enableDrag: true,
              flag: OverlayFlag.focusPointer,
              visibility: NotificationVisibility.visibilityPublic,
            );
          }
          await FlutterOverlayWindow.shareData({
            'name': lead['name'] ?? lead['customer_name'] ?? 'Customer',
            'company': lead['company'] ?? lead['business_name'] ?? 'Sensible CRM',
            'stage': lead['stage'] ?? 'Follow-up',
            'phone': phoneNumber,
            'simInfo': 'SIM 1 (Active)',
            'note': lead['comments'] ?? lead['notes'] ?? 'Updated lead from server',
          });
        }
      }
    } catch (e) {
      debugPrint('[PhoneStateWatcher] Network lookup error (fallback to cache): $e');
    }
  }

  Future<void> _handleCallEnded(String phoneNumber) async {
    if (_isProcessingEnd) return;
    _isProcessingEnd = true;

    try {
      // 1. Close the Caller ID overlay window if open
      final isOverlayOpen = await FlutterOverlayWindow.isActive();
      if (isOverlayOpen) {
        await FlutterOverlayWindow.closeOverlay();
      }

      // 2. Clear ringing status on CRM backend
      if (_activeRingingLeadId != null) {
        await _apiClient.setLeadRinging(_activeRingingLeadId!, false);
        _activeRingingLeadId = null;
      }

      // 3. Android writes duration with a small delay; wait and upload
      for (final delay in const [
        Duration(seconds: 1),
        Duration(seconds: 3),
      ]) {
        await Future.delayed(delay);
        final synced = await _callLogService.syncLatestCall();
        if (synced != null && synced.durationSeconds > 0) {
          debugPrint('[PhoneStateWatcher] Synced call with duration: ${synced.durationSeconds}s');
          break;
        }
      }
    } catch (e) {
      debugPrint('[PhoneStateWatcher] Error handling call end: $e');
    } finally {
      _isProcessingEnd = false;
    }
  }

  void dispose() {
    _sub?.cancel();
  }
}

