import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../../core/api/postgres_api_client.dart';

class LeadItem {
  final String id;
  final String name;
  final String phone;
  final String businessName;
  final String stage;
  final String source;
  final String notes;

  LeadItem({
    required this.id,
    required this.name,
    required this.phone,
    required this.businessName,
    required this.stage,
    required this.source,
    required this.notes,
  });

  factory LeadItem.fromMap(Map<String, dynamic> map) {
    return LeadItem(
      id: map['id']?.toString() ?? '',
      name: map['name']?.toString() ?? 'Unnamed Lead',
      phone: map['mobileNumber']?.toString() ?? map['phoneNumber']?.toString() ?? map['phone']?.toString() ?? '',
      businessName: map['businessName']?.toString() ?? map['companyName']?.toString() ?? '',
      stage: map['stage']?.toString() ?? 'New',
      source: map['source']?.toString() ?? 'Direct',
      notes: map['notes']?.toString() ?? '',
    );
  }
}

class LeadsScreen extends StatefulWidget {
  const LeadsScreen({super.key});

  @override
  State<LeadsScreen> createState() => _LeadsScreenState();
}

class _LeadsScreenState extends State<LeadsScreen> {
  final PostgresApiClient _apiClient = PostgresApiClient();
  List<LeadItem> _leads = [];
  bool _isLoading = false;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _fetchLeads();
  }

  Future<void> _fetchLeads() async {
    setState(() => _isLoading = true);
    try {
      final url = Uri.parse('${_apiClient.baseUrl}/leads?outletId=${_apiClient.currentOutletId}&limit=50&search=$_searchQuery');
      final res = await http.get(
        url,
        headers: {
          'Content-Type': 'application/json',
          'x-postgres-session': '1',
        },
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final body = jsonDecode(res.body);
        final data = body['data'];
        List items = [];
        if (data is Map && data['items'] is List) {
          items = data['items'];
        } else if (data is List) {
          items = data;
        }

        setState(() {
          _leads = items.map((m) => LeadItem.fromMap(Map<String, dynamic>.from(m))).toList();
        });
      }
    } catch (e) {
      debugPrint('[LeadsScreen] Error loading leads: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _openCreateLeadModal() {
    final nameCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    final companyCtrl = TextEditingController();
    final noteCtrl = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF1E293B),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Add New CRM Lead',
              style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: nameCtrl,
              style: const TextStyle(color: Colors.white),
              decoration: _inputDecoration('Contact Person Name', Icons.person),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: phoneCtrl,
              keyboardType: TextInputType.phone,
              style: const TextStyle(color: Colors.white),
              decoration: _inputDecoration('Phone Number', Icons.phone),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: companyCtrl,
              style: const TextStyle(color: Colors.white),
              decoration: _inputDecoration('Company / Business Name', Icons.business),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: noteCtrl,
              maxLines: 2,
              style: const TextStyle(color: Colors.white),
              decoration: _inputDecoration('Requirement / Initial Notes', Icons.notes),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: () async {
                  if (phoneCtrl.text.trim().isEmpty) return;
                  Navigator.pop(ctx);
                  await _submitLead(
                    nameCtrl.text.trim(),
                    phoneCtrl.text.trim(),
                    companyCtrl.text.trim(),
                    noteCtrl.text.trim(),
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0284C7),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text('Save to PostgreSQL CRM', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(String label, IconData icon) {
    return InputDecoration(
      labelText: label,
      labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
      prefixIcon: Icon(icon, color: const Color(0xFF38BDF8), size: 20),
      filled: true,
      fillColor: const Color(0xFF0F172A),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFF334155)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFF334155)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFF38BDF8)),
      ),
    );
  }

  Future<void> _submitLead(String name, String phone, String company, String notes) async {
    try {
      final url = Uri.parse('${_apiClient.baseUrl}/leads');
      final res = await http.post(
        url,
        headers: {
          'Content-Type': 'application/json',
          'x-postgres-session': '1',
        },
        body: jsonEncode({
          'outletId': _apiClient.currentOutletId,
          'name': name.isNotEmpty ? name : 'New Lead',
          'mobileNumber': phone,
          'businessName': company,
          'notes': notes,
          'source': 'Sensible Mobile App',
        }),
      );

      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(backgroundColor: Color(0xFF059669), content: Text('Lead saved to PostgreSQL!')),
          );
        }
        _fetchLeads();
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(backgroundColor: Colors.red, content: Text('Failed to save lead: ${res.body}')),
          );
        }
      }
    } catch (e) {
      debugPrint('[LeadsScreen] Error submitting lead: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text('CRM Leads Pipeline', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Color(0xFF38BDF8)),
            onPressed: _fetchLeads,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openCreateLeadModal,
        backgroundColor: const Color(0xFF0284C7),
        child: const Icon(Icons.person_add, color: Colors.white),
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            color: const Color(0xFF1E293B),
            child: TextField(
              onChanged: (val) {
                _searchQuery = val;
                _fetchLeads();
              },
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Search leads by name, phone, or company...',
                hintStyle: TextStyle(color: Colors.grey[500], fontSize: 13),
                prefixIcon: const Icon(Icons.search, color: Color(0xFF38BDF8), size: 20),
                filled: true,
                fillColor: const Color(0xFF0F172A),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator(color: Color(0xFF38BDF8)))
                : _leads.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.people_outline, size: 54, color: Colors.grey[600]),
                            const SizedBox(height: 12),
                            Text(
                              'No leads found in pipeline.',
                              style: TextStyle(color: Colors.grey[400]),
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _fetchLeads,
                        color: const Color(0xFF38BDF8),
                        child: ListView.builder(
                          padding: const EdgeInsets.all(12),
                          itemCount: _leads.length,
                          itemBuilder: (ctx, i) => _buildLeadCard(_leads[i]),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildLeadCard(LeadItem lead) {
    Color stageColor;
    switch (lead.stage.toLowerCase()) {
      case 'won':
      case 'closed won':
        stageColor = const Color(0xFF10B981);
        break;
      case 'in discussion':
      case 'follow up':
        stageColor = const Color(0xFF38BDF8);
        break;
      case 'quotation sent':
        stageColor = const Color(0xFFFBBF24);
        break;
      case 'lost':
        stageColor = const Color(0xFFEF4444);
        break;
      default:
        stageColor = const Color(0xFF94A3B8);
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  lead.name,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: stageColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: stageColor, width: 0.8),
                ),
                child: Text(
                  lead.stage,
                  style: TextStyle(color: stageColor, fontSize: 11, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          if (lead.businessName.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              lead.businessName,
              style: TextStyle(color: Colors.grey[400], fontSize: 13),
            ),
          ],
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.phone, size: 14, color: Color(0xFF38BDF8)),
                  const SizedBox(width: 4),
                  Text(
                    lead.phone.isNotEmpty ? lead.phone : 'No phone',
                    style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 13),
                  ),
                ],
              ),
              Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.chat, color: Color(0xFF10B981), size: 20),
                    tooltip: 'WhatsApp',
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Triggering WhatsApp chat for ${lead.phone}')),
                      );
                    },
                  ),
                  IconButton(
                    icon: const Icon(Icons.call, color: Color(0xFF38BDF8), size: 20),
                    tooltip: 'Call Lead',
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Calling ${lead.phone}...')),
                      );
                    },
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}
