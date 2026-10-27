import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'core/api/postgres_api_client.dart';
import 'core/telephony/phone_state_watcher.dart';
import 'core/overlay/caller_id_overlay.dart';
import 'ui/screens/app_scaffold.dart';

// Top-level entry point for Caller ID Floating Overlay
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

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 1. Initialize PostgreSQL Client
  await PostgresApiClient().init();

  // 2. Start Telephony & Call State Watcher
  await PhoneStateWatcher().start();

  runApp(const SensibleCrmApp());
}

class SensibleCrmApp extends StatelessWidget {
  const SensibleCrmApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Sensible AI CRM',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0F172A),
        primaryColor: const Color(0xFF0284C7),
        textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF38BDF8),
          surface: Color(0xFF1E293B),
        ),
      ),
      home: const AppScaffold(),
    );
  }
}
