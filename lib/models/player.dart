/// Represents a player in the tennis strategy game.
class Player {
  /// Unique identifier for the player.
  final String id;

  /// Display name of the player.
  final String name;

  /// Player's skill level (0.0 - 1.0).
  /// Determines how good their base execution of a shot or recovery/anticipation is.
  final double skill;

  const Player({required this.id, required this.name, required this.skill})
    : assert(skill >= 0.0 && skill <= 1.0, 'Skill must be between 0.0 and 1.0');

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Player &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          name == other.name &&
          skill == other.skill;

  @override
  int get hashCode => id.hashCode ^ name.hashCode ^ skill.hashCode;

  @override
  String toString() => 'Player(id: $id, name: $name, skill: $skill)';
}
