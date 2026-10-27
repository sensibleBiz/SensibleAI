import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../../core/api/postgres_api_client.dart';

class ExpenseItem {
  final String id;
  final String category;
  final double amount;
  final String description;
  final String status;
  final DateTime date;

  ExpenseItem({
    required this.id,
    required this.category,
    required this.amount,
    required this.description,
    required this.status,
    required this.date,
  });
}

class ExpensesScreen extends StatefulWidget {
  const ExpensesScreen({super.key});

  @override
  State<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends State<ExpensesScreen> {
  final PostgresApiClient _apiClient = PostgresApiClient();
  final List<ExpenseItem> _expenses = [
    ExpenseItem(
      id: 'exp_1',
      category: 'Fuel & Conveyance',
      amount: 1450.00,
      description: 'Client visit to Hadapsar industrial estate',
      status: 'APPROVED',
      date: DateTime.now().subtract(const Duration(days: 1)),
    ),
    ExpenseItem(
      id: 'exp_2',
      category: 'Client Lunch',
      amount: 880.00,
      description: 'Lunch meeting with VP Sourcing, Apex Export Co',
      status: 'PENDING',
      date: DateTime.now().subtract(const Duration(days: 2)),
    ),
    ExpenseItem(
      id: 'exp_3',
      category: 'Office Supplies',
      amount: 420.00,
      description: 'Printer cartridges & billing rolls',
      status: 'APPROVED',
      date: DateTime.now().subtract(const Duration(days: 4)),
    ),
  ];

  void _openAddExpenseModal() {
    final amountCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    String selectedCategory = 'Fuel & Conveyance';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF1E293B),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) => Padding(
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
                'Submit Expense Claim',
                style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: selectedCategory,
                dropdownColor: const Color(0xFF0F172A),
                style: const TextStyle(color: Colors.white),
                decoration: _inputDecoration('Category', Icons.category),
                items: [
                  'Fuel & Conveyance',
                  'Client Lunch',
                  'Hotel & Lodging',
                  'Office Supplies',
                  'Client Entertainment',
                ].map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                onChanged: (v) {
                  if (v != null) setModalState(() => selectedCategory = v);
                },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: amountCtrl,
                keyboardType: TextInputType.number,
                style: const TextStyle(color: Colors.white),
                decoration: _inputDecoration('Amount (₹ INR)', Icons.currency_rupee),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: descCtrl,
                maxLines: 2,
                style: const TextStyle(color: Colors.white),
                decoration: _inputDecoration('Description & Purpose', Icons.description),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: () async {
                    final amt = double.tryParse(amountCtrl.text.trim()) ?? 0;
                    if (amt <= 0) return;
                    Navigator.pop(ctx);
                    await _submitExpense(selectedCategory, amt, descCtrl.text.trim());
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0284C7),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text('Submit Claim to PostgreSQL', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
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

  Future<void> _submitExpense(String category, double amount, String desc) async {
    try {
      final url = Uri.parse('${_apiClient.baseUrl}/expenses');
      await http.post(
        url,
        headers: {
          'Content-Type': 'application/json',
          'x-postgres-session': '1',
        },
        body: jsonEncode({
          'outletId': _apiClient.currentOutletId,
          'category': category,
          'amount': amount,
          'description': desc,
          'source': 'Sensible Mobile App',
        }),
      );

      setState(() {
        _expenses.insert(
          0,
          ExpenseItem(
            id: 'exp_${DateTime.now().millisecondsSinceEpoch}',
            category: category,
            amount: amount,
            description: desc,
            status: 'PENDING',
            date: DateTime.now(),
          ),
        );
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            backgroundColor: Color(0xFF10B981),
            content: Text('Expense claim submitted for approval!'),
          ),
        );
      }
    } catch (e) {
      debugPrint('[ExpensesScreen] Error submitting expense: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final totalSpent = _expenses.fold<double>(0, (sum, item) => sum + item.amount);

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text('Field Expense Claims', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        elevation: 0,
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openAddExpenseModal,
        backgroundColor: const Color(0xFF0284C7),
        child: const Icon(Icons.receipt_long, color: Colors.white),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF1E293B),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Total Claimed This Month', style: TextStyle(color: Colors.white70, fontSize: 13)),
                    const SizedBox(height: 4),
                    Text(
                      '₹ ${totalSpent.toStringAsFixed(2)}',
                      style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0284C7).withValues(alpha: 0.2),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.account_balance_wallet, color: Color(0xFF38BDF8), size: 28),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          const Text(
            'Recent Claims',
            style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
          ),

          const SizedBox(height: 12),

          ..._expenses.map((exp) => _buildExpenseCard(exp)),
        ],
      ),
    );
  }

  Widget _buildExpenseCard(ExpenseItem exp) {
    final isApproved = exp.status == 'APPROVED';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: (isApproved ? const Color(0xFF10B981) : const Color(0xFFFBBF24))
                .withValues(alpha: 0.15),
            child: Icon(
              isApproved ? Icons.check : Icons.hourglass_top,
              color: isApproved ? const Color(0xFF10B981) : const Color(0xFFFBBF24),
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  exp.category,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                ),
                if (exp.description.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    exp.description,
                    style: TextStyle(color: Colors.grey[400], fontSize: 12),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '₹ ${exp.amount.toStringAsFixed(2)}',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
              ),
              const SizedBox(height: 2),
              Text(
                exp.status,
                style: TextStyle(
                  color: isApproved ? const Color(0xFF34D399) : const Color(0xFFFBBF24),
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
