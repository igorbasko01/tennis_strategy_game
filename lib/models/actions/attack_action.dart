/// Represents an attack action (rally shot) that a player can perform.
///
/// Each attack action has an associated cost modifier that affects the success calculation.
enum AttackAction {
  /// Shot hit diagonally across the court.
  /// Cost: -0.2
  crossCourt(-0.2),

  /// Shot hit straight down the sideline.
  /// Cost: -0.3
  downTheLine(-0.3),

  /// Safe shot hit deep into the center of the court.
  /// Cost: -0.1
  centerDeep(-0.1),

  /// Short, soft shot aimed near the net.
  /// Cost: -0.3
  dropShot(-0.3);

  /// The cost modifier for this attack action.
  /// Negative values indicate higher difficulty.
  final double cost;

  const AttackAction(this.cost);
}
