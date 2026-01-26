import 'player.dart';

/// Represents the outcome of a point.
enum PointOutcome {
  /// The server won the point.
  serverWins,

  /// The receiver won the point.
  receiverWins,

  /// The rally continues (neither player has won yet).
  rallyContinues,
}

/// Represents the result of a point resolution.
class PointResult {
  /// The outcome of the point.
  final PointOutcome outcome;

  /// The player who won the point, if the point is finished.
  /// Null if the rally continues.
  final Player? winner;

  /// Optional description of how the point ended.
  final String? description;

  const PointResult({required this.outcome, this.winner, this.description});

  /// Creates a result indicating the server won.
  const PointResult.serverWins({this.winner, this.description})
    : outcome = PointOutcome.serverWins;

  /// Creates a result indicating the receiver won.
  const PointResult.receiverWins({this.winner, this.description})
    : outcome = PointOutcome.receiverWins;

  /// Creates a result indicating the rally continues.
  const PointResult.rallyContinues({this.description})
    : outcome = PointOutcome.rallyContinues,
      winner = null;

  /// Returns true if the point is finished (has a winner).
  bool get isFinished => outcome != PointOutcome.rallyContinues;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PointResult &&
          runtimeType == other.runtimeType &&
          outcome == other.outcome &&
          winner == other.winner &&
          description == other.description;

  @override
  int get hashCode =>
      outcome.hashCode ^ winner.hashCode ^ (description?.hashCode ?? 0);

  @override
  String toString() =>
      'PointResult(outcome: $outcome, winner: $winner, description: $description)';
}
