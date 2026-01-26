import 'player.dart';
import 'turn_manager.dart';
import 'turn/server_choice.dart';
import 'turn/receiver_choice.dart';

/// Manages the overall game state and coordinates gameplay between two players.
///
/// The GameManager is responsible for:
/// - Maintaining the two players in the game
/// - Managing the turn state via TurnManager
/// - Handling player actions
class GameManager {
  /// The first player in the game.
  final Player player1;

  /// The second player in the game.
  final Player player2;

  /// Manages turn state and player roles.
  final TurnManager turnManager;

  /// The server's current choice for this turn (if set).
  ServerChoice? _serverChoice;

  /// The receiver's current choice for this turn (if set).
  ReceiverChoice? _receiverChoice;

  /// Creates a new GameManager with two players.
  ///
  /// [player1] will be the initial server.
  /// [player2] will be the initial receiver.
  GameManager({
    required this.player1,
    required this.player2,
  }) : turnManager = TurnManager(
          initialServer: player1,
          initialReceiver: player2,
        );

  /// Gets the current server.
  Player get currentServer => turnManager.server;

  /// Gets the current receiver.
  Player get currentReceiver => turnManager.receiver;

  /// Gets the server's current choice (may be null if not yet set).
  ServerChoice? get serverChoice => _serverChoice;

  /// Gets the receiver's current choice (may be null if not yet set).
  ReceiverChoice? get receiverChoice => _receiverChoice;

  /// Submits the server's choice for the current turn.
  ///
  /// [choice] is the server's bundled decision for this turn.
  void submitServerChoice(ServerChoice choice) {
    _serverChoice = choice;
  }

  /// Submits the receiver's choice for the current turn.
  ///
  /// [choice] is the receiver's bundled decision for this turn.
  void submitReceiverChoice(ReceiverChoice choice) {
    _receiverChoice = choice;
  }

  /// Checks if both players have submitted their choices.
  bool get bothPlayersReady => _serverChoice != null && _receiverChoice != null;

  /// Ends the current turn, switches player roles, and clears choices.
  ///
  /// After calling this method:
  /// - The server becomes the receiver
  /// - The receiver becomes the server
  /// - Both player choices are reset to null
  void endTurn() {
    turnManager.endTurn();
    _serverChoice = null;
    _receiverChoice = null;
  }
}
