import 'package:flutter/material.dart';
import '../../core/updater/ota_update_service.dart';
import 'home_screen.dart';
import 'leads_screen.dart';
import 'attendance_screen.dart';
import 'expenses_screen.dart';

class AppScaffold extends StatefulWidget {
  const AppScaffold({super.key});

  @override
  State<AppScaffold> createState() => _AppScaffoldState();
}

class _AppScaffoldState extends State<AppScaffold> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    HomeScreen(),
    LeadsScreen(),
    AttendanceScreen(),
    ExpensesScreen(),
  ];

  @override
  void initState() {
    super.initState();
    _checkForOtaUpdates();
  }

  Future<void> _checkForOtaUpdates() async {
    // Delay slightly after first frame so context is ready
    await Future.delayed(const Duration(seconds: 2));
    if (!mounted) return;

    final updateInfo = await OtaUpdateService.checkForUpdate();
    if (updateInfo != null && mounted) {
      OtaUpdateService.promptUpdate(context, updateInfo);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: NavigationBarTheme(
        data: NavigationBarThemeData(
          backgroundColor: const Color(0xFF1E293B),
          indicatorColor: const Color(0xFF0284C7).withValues(alpha: 0.3),
          labelTextStyle: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return const TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.bold, fontSize: 12);
            }
            return const TextStyle(color: Colors.grey, fontSize: 11);
          }),
        ),
        child: NavigationBar(
          selectedIndex: _currentIndex,
          onDestinationSelected: (idx) => setState(() => _currentIndex = idx),
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.phone_outlined, color: Colors.grey),
              selectedIcon: Icon(Icons.phone, color: Color(0xFF38BDF8)),
              label: 'Calls & SIM',
            ),
            NavigationDestination(
              icon: Icon(Icons.people_outline, color: Colors.grey),
              selectedIcon: Icon(Icons.people, color: Color(0xFF38BDF8)),
              label: 'Leads',
            ),
            NavigationDestination(
              icon: Icon(Icons.fingerprint_outlined, color: Colors.grey),
              selectedIcon: Icon(Icons.fingerprint, color: Color(0xFF38BDF8)),
              label: 'Attendance',
            ),
            NavigationDestination(
              icon: Icon(Icons.receipt_long_outlined, color: Colors.grey),
              selectedIcon: Icon(Icons.receipt_long, color: Color(0xFF38BDF8)),
              label: 'Expenses',
            ),
          ],
        ),
      ),
    );
  }
}
