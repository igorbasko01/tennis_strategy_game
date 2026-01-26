import '../actions/serve_receive_action.dart';
import '../actions/attack_action.dart';

/// Represents the receiver's bundled choice during Phase A (The Serve).
///
/// The receiver must choose both their anticipation zone and their return target.
class ReceiverChoice {
  /// The anticipation/recovery zone for receiving the serve.
  final ServeReceiveAction anticipationZone;

  /// The target zone for the return shot.
  final AttackAction returnTarget;

  const ReceiverChoice({
    required this.anticipationZone,
    required this.returnTarget,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ReceiverChoice &&
          runtimeType == other.runtimeType &&
          anticipationZone == other.anticipationZone &&
          returnTarget == other.returnTarget;

  @override
  int get hashCode => anticipationZone.hashCode ^ returnTarget.hashCode;

  @override
  String toString() =>
      'ReceiverChoice(anticipationZone: $anticipationZone, returnTarget: $returnTarget)';
}
