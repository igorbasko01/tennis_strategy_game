/// Represents the breakdown of a shot success calculation.
///
/// This is used to track how the final shot total was computed,
/// useful for debugging and displaying to the player.
class ShotCalculation {
  /// The player's base skill level (0.0 - 1.0).
  final double skill;

  /// The action cost modifier (e.g., -0.3 for a wide serve).
  final double actionCost;

  /// The random factor applied (-0.3 to +0.3 range).
  final double randomFactor;

  /// The calculated total: skill + actionCost + randomFactor.
  double get total => skill + actionCost + randomFactor;

  const ShotCalculation({
    required this.skill,
    required this.actionCost,
    required this.randomFactor,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ShotCalculation &&
          runtimeType == other.runtimeType &&
          skill == other.skill &&
          actionCost == other.actionCost &&
          randomFactor == other.randomFactor;

  @override
  int get hashCode =>
      skill.hashCode ^ actionCost.hashCode ^ randomFactor.hashCode;

  @override
  String toString() =>
      'ShotCalculation(skill: $skill, actionCost: $actionCost, randomFactor: $randomFactor, total: $total)';
}

/// Represents the breakdown of an anticipation/defense calculation.
///
/// This is used to track how the final defense total was computed.
class AnticipationCalculation {
  /// The player's base skill level (0.0 - 1.0).
  final double skill;

  /// The anticipation modifier based on how well the defender predicted the attack.
  final double anticipationModifier;

  /// The random factor applied (-0.3 to +0.3 range).
  final double randomFactor;

  /// The calculated total: skill + anticipationModifier + randomFactor.
  double get total => skill + anticipationModifier + randomFactor;

  const AnticipationCalculation({
    required this.skill,
    required this.anticipationModifier,
    required this.randomFactor,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AnticipationCalculation &&
          runtimeType == other.runtimeType &&
          skill == other.skill &&
          anticipationModifier == other.anticipationModifier &&
          randomFactor == other.randomFactor;

  @override
  int get hashCode =>
      skill.hashCode ^ anticipationModifier.hashCode ^ randomFactor.hashCode;

  @override
  String toString() =>
      'AnticipationCalculation(skill: $skill, anticipationModifier: $anticipationModifier, randomFactor: $randomFactor, total: $total)';
}
