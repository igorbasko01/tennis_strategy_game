import 'attack_action.dart';

/// Represents a defend action (anticipation/positioning) against an attack.
///
/// The effectiveness of each defend action depends on the attack action it's defending against.
enum DefendAction {
  /// Anticipate/position for a cross-court shot.
  crossCourt,

  /// Anticipate/position for a down-the-line shot.
  downTheLine,

  /// Anticipate/position for a center deep shot.
  centerDeep,

  /// Anticipate/position for a drop shot.
  dropShot;

  /// Returns the modifier for this defend action against the given attack action.
  ///
  /// Positive values indicate good anticipation, negative values indicate poor positioning.
  double getModifierAgainst(AttackAction attack) {
    return _modifierMatrix[attack]![this]!;
  }

  /// Matrix of modifiers: AttackAction -> DefendAction -> modifier value
  static const Map<AttackAction, Map<DefendAction, double>> _modifierMatrix = {
    AttackAction.crossCourt: {
      DefendAction.crossCourt: 0.3, // Correct anticipation
      DefendAction.downTheLine: -0.6, // Wrong side
      DefendAction.centerDeep: -0.3, // Slight miss
      DefendAction.dropShot: -0.6, // Wrong positioning
    },
    AttackAction.downTheLine: {
      DefendAction.crossCourt: -0.6, // Wrong side
      DefendAction.downTheLine: 0.3, // Correct anticipation
      DefendAction.centerDeep: -0.1, // Close enough
      DefendAction.dropShot: -0.3, // Wrong positioning
    },
    AttackAction.centerDeep: {
      DefendAction.crossCourt: -0.3,
      DefendAction.downTheLine: -0.3,
      DefendAction.centerDeep: 0.3, // Correct anticipation
      DefendAction.dropShot: -0.3, // Wrong positioning
    },
    AttackAction.dropShot: {
      DefendAction.crossCourt: -0.3,
      DefendAction.downTheLine: -0.3,
      DefendAction.centerDeep: -0.3,
      DefendAction.dropShot: 0.6, // Correct anticipation (higher bonus)
    },
  };
}
