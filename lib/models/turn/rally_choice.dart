import '../actions/attack_action.dart';
import '../actions/defend_action.dart';

/// Represents a player's bundled choice during a rally exchange.
///
/// Each player must choose both their attack target and their anticipated defense zone.
class RallyChoice {
  /// The target zone for the attack shot.
  final AttackAction attackTarget;

  /// The anticipated defense/recovery zone for the opponent's return.
  final DefendAction anticipationZone;

  const RallyChoice({
    required this.attackTarget,
    required this.anticipationZone,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is RallyChoice &&
          runtimeType == other.runtimeType &&
          attackTarget == other.attackTarget &&
          anticipationZone == other.anticipationZone;

  @override
  int get hashCode => attackTarget.hashCode ^ anticipationZone.hashCode;

  @override
  String toString() =>
      'RallyChoice(attackTarget: $attackTarget, anticipationZone: $anticipationZone)';
}
