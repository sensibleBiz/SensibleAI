import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CachedLeadContact {
  final String leadId;
  final String name;
  final String company;
  final String phone;
  final String stage;
  final double dealValue;
  final String? assignedRep;
  final String? lastNote;
  final String? lastContactedAt;

  CachedLeadContact({
    required this.leadId,
    required this.name,
    required this.company,
    required this.phone,
    required this.stage,
    required this.dealValue,
    this.assignedRep,
    this.lastNote,
    this.lastContactedAt,
  });

  Map<String, dynamic> toJson() => {
        'leadId': leadId,
        'name': name,
        'company': company,
        'phone': phone,
        'stage': stage,
        'dealValue': dealValue,
        'assignedRep': assignedRep,
        'lastNote': lastNote,
        'lastContactedAt': lastContactedAt,
      };

  factory CachedLeadContact.fromJson(Map<String, dynamic> json) =>
      CachedLeadContact(
        leadId: json['leadId']?.toString() ?? '',
        name: json['name']?.toString() ?? 'Unknown Lead',
        company: json['company']?.toString() ?? 'Sensible CRM',
        phone: json['phone']?.toString() ?? '',
        stage: json['stage']?.toString() ?? 'Prospect',
        dealValue: (json['dealValue'] is num)
            ? (json['dealValue'] as num).toDouble()
            : 0.0,
        assignedRep: json['assignedRep']?.toString(),
        lastNote: json['lastNote']?.toString(),
        lastContactedAt: json['lastContactedAt']?.toString(),
      );
}

class CallerIdCacheService {
  static final CallerIdCacheService _instance =
      CallerIdCacheService._internal();
  factory CallerIdCacheService() => _instance;
  CallerIdCacheService._internal();

  static const String _prefKey = 'sensible_caller_id_lead_cache_v1';
  final Map<String, CachedLeadContact> _memoryCache = {};
  bool _isInitialized = false;

  /// Clean & normalize phone number for exact/suffix matching (last 10 digits)
  static String normalizePhone(String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.length > 10) {
      return digits.substring(digits.length - 10);
    }
    return digits;
  }

  Future<void> init() async {
    if (_isInitialized) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final jsonStr = prefs.getString(_prefKey);
      if (jsonStr != null && jsonStr.isNotEmpty) {
        final Map<String, dynamic> decoded = jsonDecode(jsonStr);
        decoded.forEach((key, val) {
          if (val is Map<String, dynamic>) {
            _memoryCache[key] = CachedLeadContact.fromJson(val);
          }
        });
      }
      _isInitialized = true;
      debugPrint('[CallerIdCache] Loaded ${_memoryCache.length} contacts into 0ms memory cache');
    } catch (e) {
      debugPrint('[CallerIdCache] Error initializing cache: $e');
    }
  }

  /// Instant sub-5ms local lookup for incoming phone numbers
  CachedLeadContact? lookup(String phoneNumber) {
    if (phoneNumber.isEmpty) return null;
    final normalized = normalizePhone(phoneNumber);
    return _memoryCache[normalized];
  }

  /// Save or update a single contact in cache
  Future<void> putContact(CachedLeadContact contact) async {
    final key = normalizePhone(contact.phone);
    if (key.isEmpty) return;
    _memoryCache[key] = contact;
    await _persist();
  }

  /// Bulk sync contacts fetched from PostgreSQL
  Future<void> putAllContacts(List<CachedLeadContact> contacts) async {
    for (final c in contacts) {
      final key = normalizePhone(c.phone);
      if (key.isNotEmpty) {
        _memoryCache[key] = c;
      }
    }
    await _persist();
    debugPrint('[CallerIdCache] Persisted ${_memoryCache.length} contacts');
  }

  Future<void> _persist() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final mapToSave = _memoryCache.map(
        (key, contact) => MapEntry(key, contact.toJson()),
      );
      await prefs.setString(_prefKey, jsonEncode(mapToSave));
    } catch (e) {
      debugPrint('[CallerIdCache] Error saving cache: $e');
    }
  }

  int get totalCached => _memoryCache.length;
}
