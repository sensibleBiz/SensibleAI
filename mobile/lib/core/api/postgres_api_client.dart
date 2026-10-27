import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/call_entry.dart';

class PostgresApiClient {
  static final PostgresApiClient _instance = PostgresApiClient._internal();
  factory PostgresApiClient() => _instance;
  PostgresApiClient._internal();

  // Default production Cloud Run API or local development URL
  String _baseUrl = 'https://sales.sensible.biz/api';
  String? _authToken;
  String _currentOutletId = 'default_outlet';
  String _currentUserId = 'default_user';
  String _currentUserName = 'Sales Agent';
  String _currentUserMobile = '';

  String get baseUrl => _baseUrl;
  String get currentOutletId => _currentOutletId;
  String get currentUserId => _currentUserId;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _baseUrl = prefs.getString('api_base_url') ?? 'https://sales.sensible.biz/api';
    _authToken = prefs.getString('api_auth_token');
    _currentOutletId = prefs.getString('outlet_id') ?? 'default_outlet';
    _currentUserId = prefs.getString('user_id') ?? 'default_user';
    _currentUserName = prefs.getString('user_name') ?? 'Sales Agent';
    _currentUserMobile = prefs.getString('user_mobile') ?? '';
  }

  Future<void> updateConfig({
    String? baseUrl,
    String? authToken,
    String? outletId,
    String? userId,
    String? userName,
    String? userMobile,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    if (baseUrl != null) {
      _baseUrl = baseUrl;
      await prefs.setString('api_base_url', baseUrl);
    }
    if (authToken != null) {
      _authToken = authToken;
      await prefs.setString('api_auth_token', authToken);
    }
    if (outletId != null) {
      _currentOutletId = outletId;
      await prefs.setString('outlet_id', outletId);
    }
    if (userId != null) {
      _currentUserId = userId;
      await prefs.setString('user_id', userId);
    }
    if (userName != null) {
      _currentUserName = userName;
      await prefs.setString('user_name', userName);
    }
    if (userMobile != null) {
      _currentUserMobile = userMobile;
      await prefs.setString('user_mobile', userMobile);
    }
  }

  Map<String, String> _buildHeaders() {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'x-postgres-session': '1',
    };
    if (_authToken != null && _authToken!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $_authToken';
    }
    return headers;
  }

  /// Uploads a completed phone call record to PostgreSQL backend
  Future<bool> uploadCallLog(CallEntry entry) async {
    try {
      final url = Uri.parse('$_baseUrl/calls');
      final payload = {
        'outletId': _currentOutletId,
        'direction': entry.direction.name,
        'durationSeconds': entry.durationSeconds,
        'number': entry.number,
        'receiverMobileNo': _currentUserMobile.isNotEmpty ? _currentUserMobile : entry.number,
        'receiverName': _currentUserName,
        'name': entry.name.isNotEmpty ? entry.name : 'Unknown Contact',
        'timestamp': entry.timestamp.millisecondsSinceEpoch,
        'simLabel': entry.simLabel ?? 'SIM 1',
        'simPhoneNumber': entry.simPhoneNumber ?? '',
        'subscriptionId': entry.subscriptionId ?? '0',
        'leadId': entry.leadId,
        'externalCallSource': 'sensible_mobile_app',
        'externalCallId': entry.id,
      };

      final response = await http.post(
        url,
        headers: _buildHeaders(),
        body: jsonEncode(payload),
      ).timeout(const Duration(seconds: 15));

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return true;
      } else {
        debugPrint('[PostgresApiClient] Failed to upload call: ${response.statusCode} - ${response.body}');
        return false;
      }
    } catch (e) {
      debugPrint('[PostgresApiClient] Error uploading call log: $e');
      return false;
    }
  }

  /// Look up Lead info by incoming phone number in PostgreSQL
  Future<Map<String, dynamic>?> lookupLeadByPhone(String rawPhone) async {
    try {
      final clean = rawPhone.replaceAll(RegExp(r'[^0-9]'), '');
      if (clean.length < 5) return null;

      final url = Uri.parse('$_baseUrl/leads?outletId=$_currentOutletId&search=$clean');
      final response = await http.get(url, headers: _buildHeaders()).timeout(const Duration(seconds: 4));

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body);
        final data = body['data'];
        List items = [];
        if (data is Map && data['items'] is List) {
          items = data['items'];
        } else if (data is List) {
          items = data;
        }

        if (items.isNotEmpty) {
          final first = items.first;
          return {
            'id': first['id']?.toString() ?? '',
            'name': first['name']?.toString() ?? 'Lead',
            'businessName': first['businessName']?.toString() ?? first['companyName']?.toString() ?? '',
            'stage': first['stage']?.toString() ?? 'New',
            'notes': first['notes']?.toString() ?? '',
          };
        }
      }
      return null;
    } catch (e) {
      debugPrint('[PostgresApiClient] Error looking up lead: $e');
      return null;
    }
  }

  /// Sets lead ringing status on PostgreSQL CRM
  Future<void> setLeadRinging(String leadId, bool isRinging) async {
    try {
      final url = Uri.parse('$_baseUrl/leads/$leadId/ringing');
      await http.post(
        url,
        headers: _buildHeaders(),
        body: jsonEncode({
          'outletId': _currentOutletId,
          'ringing': isRinging,
        }),
      ).timeout(const Duration(seconds: 3));
    } catch (e) {
      debugPrint('[PostgresApiClient] Failed to set lead ringing: $e');
    }
  }
}

