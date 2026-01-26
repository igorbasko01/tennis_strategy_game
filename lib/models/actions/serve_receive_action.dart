import 'serve_action.dart';

/// Represents a serve receive action that the receiver can perform.
///
/// The effectiveness of each receive action depends on the serve action it's defending against.
enum ServeReceiveAction {
  /// Anticipate/position for a wide serve.
  wide,

  /// Anticipate/position for a body serve (neutral position).
  neutral,

  /// Anticipate/position for a T-line serve.
  tLine;

  /// Returns the modifier for this receive action against the given serve action.
  ///
  /// Positive values indicate good anticipation, negative values indicate poor positioning.
  double getModifierAgainst(ServeAction serve) {
    return _modifierMatrix[serve]![this]!;
  }

  /// Matrix of modifiers: ServeAction -> ServeReceiveAction -> modifier value
  static const Map<ServeAction, Map<ServeReceiveAction, double>>
  _modifierMatrix = {
    ServeAction.wide: {
      ServeReceiveAction.wide: 0.3, // Correct anticipation
      ServeReceiveAction.neutral: -0.3, // Slight miss
      ServeReceiveAction.tLine: -0.6, // Wrong side
    },
    ServeAction.body: {
      ServeReceiveAction.wide: -0.3,
      ServeReceiveAction.neutral: 0.3, // Correct anticipation
      ServeReceiveAction.tLine: -0.3,
    },
    ServeAction.tLine: {
      ServeReceiveAction.wide: -0.6, // Wrong side
      ServeReceiveAction.neutral: -0.3, // Slight miss
      ServeReceiveAction.tLine: 0.3, // Correct anticipation
    },
  };
}
