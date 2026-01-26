/// Represents a serve action that the server can perform.
///
/// Each serve action has an associated cost modifier that affects the success calculation.
enum ServeAction {
  /// Serve aimed at the wide corner of the service box.
  /// Cost: -0.3
  wide(-0.3),

  /// Serve aimed at the receiver's body.
  /// Cost: -0.1
  body(-0.1),

  /// Serve aimed at the T-line (center of the service box).
  /// Cost: -0.3
  tLine(-0.3);

  /// The cost modifier for this serve action.
  /// Negative values indicate higher difficulty.
  final double cost;

  const ServeAction(this.cost);
}
