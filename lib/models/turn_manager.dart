import 'player.dart';

/// Manages the current turn state and player roles in the game.
///
/// The TurnManager tracks which player is currently serving and which is receiving,
/// and provides functionality to switch roles at the end of each turn.
class TurnManager {
  /// The player who is currently serving.
  Player _server;

  /// The player who is currently receiving.
  Player _receiver;

  /// Creates a new TurnManager with the initial server and receiver.
  ///
  /// [initialServer] is the player who will serve first.
  /// [initialReceiver] is the player who will receive first.
  TurnManager({
    required Player initialServer,
    required Player initialReceiver,
  })  : _server = initialServer,
        _receiver = initialReceiver;

  /// Gets the current server.
  Player get server => _server;

  /// Gets the current receiver.
  Player get receiver => _receiver;

  /// Ends the current turn and switches the player roles.
  ///
  /// The current server becomes the receiver, and the current receiver becomes the server.
  void endTurn() {
    final temp = _server;
    _server = _receiver;
    _receiver = temp;
  }
}
