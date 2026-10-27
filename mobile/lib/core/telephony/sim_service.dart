import 'package:flutter/foundation.dart';
import 'package:sim_data/sim_data.dart';

class SimCardInfo {
  final int slotIndex;
  final String carrierName;
  final String? phoneNumber;
  final String subscriptionId;
  final String displayName;

  SimCardInfo({
    required this.slotIndex,
    required this.carrierName,
    this.phoneNumber,
    required this.subscriptionId,
    required this.displayName,
  });
}

class SimService {
  static final SimService _instance = SimService._internal();
  factory SimService() => _instance;
  SimService._internal();

  List<SimCardInfo> _simCards = [];
  List<SimCardInfo> get simCards => _simCards;

  Future<List<SimCardInfo>> loadSimCards() async {
    try {
      final simData = await SimDataPlugin.getSimData();
      _simCards = simData.cards.map((card) {
        return SimCardInfo(
          slotIndex: card.slotIndex,
          carrierName: card.carrierName,
          phoneNumber: null,
          subscriptionId: card.subscriptionId.toString(),
          displayName: '${card.displayName.isNotEmpty ? card.displayName : card.carrierName} (SIM ${card.slotIndex + 1})',
        );
      }).toList();
      return _simCards;
    } catch (e) {
      debugPrint('[SimService] Could not retrieve SIM data: $e');
      return [];
    }
  }

  SimCardInfo? getSimBySlot(int slotIndex) {
    try {
      return _simCards.firstWhere((s) => s.slotIndex == slotIndex);
    } catch (_) {
      return null;
    }
  }

  SimCardInfo? getSimBySubscriptionId(String subId) {
    try {
      return _simCards.firstWhere((s) => s.subscriptionId == subId);
    } catch (_) {
      return null;
    }
  }
}

