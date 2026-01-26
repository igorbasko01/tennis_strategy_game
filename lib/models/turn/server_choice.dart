import '../actions/serve_action.dart';
import '../actions/defend_action.dart';

/// Represents the server's bundled choice during Phase A (The Serve).
///
/// The server must choose both their serve target and their anticipated recovery zone.
class ServerChoice {
  /// The target zone for the serve.
  final ServeAction serveTarget;

  /// The anticipated recovery/anticipation zone for the receiver's return.
  final DefendAction anticipationZone;

  const ServerChoice({
    required this.serveTarget,
    required this.anticipationZone,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ServerChoice &&
          runtimeType == other.runtimeType &&
          serveTarget == other.serveTarget &&
          anticipationZone == other.anticipationZone;

  @override
  int get hashCode => serveTarget.hashCode ^ anticipationZone.hashCode;

  @override
  String toString() =>
      'ServerChoice(serveTarget: $serveTarget, anticipationZone: $anticipationZone)';
}
