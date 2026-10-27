enum CallDirection {
  incoming,
  outgoing,
  missed,
  rejected,
}

class CallEntry {
  final String id;
  final String number;
  final String name;
  final CallDirection direction;
  final int durationSeconds;
  final DateTime timestamp;
  final String? simLabel;
  final String? simPhoneNumber;
  final String? subscriptionId;
  final int? slotIndex;
  final bool synced;
  final String? leadId;
  final String? leadName;

  CallEntry({
    required this.id,
    required this.number,
    this.name = '',
    required this.direction,
    this.durationSeconds = 0,
    required this.timestamp,
    this.simLabel,
    this.simPhoneNumber,
    this.subscriptionId,
    this.slotIndex,
    this.synced = false,
    this.leadId,
    this.leadName,
  });

  CallEntry copyWith({
    String? id,
    String? number,
    String? name,
    CallDirection? direction,
    int? durationSeconds,
    DateTime? timestamp,
    String? simLabel,
    String? simPhoneNumber,
    String? subscriptionId,
    int? slotIndex,
    bool? synced,
    String? leadId,
    String? leadName,
  }) {
    return CallEntry(
      id: id ?? this.id,
      number: number ?? this.number,
      name: name ?? this.name,
      direction: direction ?? this.direction,
      durationSeconds: durationSeconds ?? this.durationSeconds,
      timestamp: timestamp ?? this.timestamp,
      simLabel: simLabel ?? this.simLabel,
      simPhoneNumber: simPhoneNumber ?? this.simPhoneNumber,
      subscriptionId: subscriptionId ?? this.subscriptionId,
      slotIndex: slotIndex ?? this.slotIndex,
      synced: synced ?? this.synced,
      leadId: leadId ?? this.leadId,
      leadName: leadName ?? this.leadName,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'number': number,
      'name': name,
      'direction': direction.name,
      'durationSeconds': durationSeconds,
      'timestamp': timestamp.millisecondsSinceEpoch,
      'simLabel': simLabel,
      'simPhoneNumber': simPhoneNumber,
      'subscriptionId': subscriptionId,
      'slotIndex': slotIndex,
      'synced': synced,
      'leadId': leadId,
      'leadName': leadName,
    };
  }

  factory CallEntry.fromMap(Map<String, dynamic> map) {
    return CallEntry(
      id: map['id']?.toString() ?? '',
      number: map['number']?.toString() ?? '',
      name: map['name']?.toString() ?? '',
      direction: CallDirection.values.firstWhere(
        (d) => d.name == map['direction'],
        orElse: () => CallDirection.incoming,
      ),
      durationSeconds: (map['durationSeconds'] as num?)?.toInt() ?? 0,
      timestamp: DateTime.fromMillisecondsSinceEpoch(
        (map['timestamp'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch,
      ),
      simLabel: map['simLabel']?.toString(),
      simPhoneNumber: map['simPhoneNumber']?.toString(),
      subscriptionId: map['subscriptionId']?.toString(),
      slotIndex: (map['slotIndex'] as num?)?.toInt(),
      synced: map['synced'] == true,
      leadId: map['leadId']?.toString(),
      leadName: map['leadName']?.toString(),
    );
  }
}

