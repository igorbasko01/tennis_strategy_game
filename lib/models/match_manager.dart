import 'dart:async';

import 'player.dart';
import 'turn_manager.dart';
import 'turn/server_choice.dart';
import 'turn/receiver_choice.dart';

/// Manages the overall match state and coordinates gameplay between two players.
///
/// The MatchManager is responsible for:
/// - Maintaining the two players in the match
/// - Managing the turn state via TurnManager
/// - Handling player actions
/// - Emitting events when turns start and end
class MatchManager {
  /// The first player in the match.
  final Player player1;

  /// The second player in the match.
  final Player player2;

  /// Manages turn state and player roles.
  final TurnManager turnManager;

  /// The server's current choice for this turn (if set).
  ServerChoice? _serverChoice;

  /// The receiver's current choice for this turn (if set).
  ReceiverChoice? _receiverChoice;

  /// Stream controller for turn start events.
  final StreamController<void> _turnStartController = StreamController<void>.broadcast();

  /// Stream controller for turn end events.
  final StreamController<void> _turnEndController = StreamController<void>.broadcast();

  /// Stream that emits events when a turn starts.
  Stream<void> get onTurnStart => _turnStartController.stream;

  /// Stream that emits events when a turn ends.
  Stream<void> get onTurnEnd => _turnEndController.stream;

  /// Creates a new MatchManager with two players.
  ///
  /// [player1] will be the initial server.
  /// [player2] will be the initial receiver.
  MatchManager({
    required this.player1,
    required this.player2,
  }) : turnManager = TurnManager(
          initialServer: player1,
          initialReceiver: player2,
        ) {
    // Emit turn start event for the initial turn
    _turnStartController.add(null);
  }

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
  /// - A turn end event is emitted
  /// - A turn start event is emitted for the new turn
  void endTurn() {
    _turnEndController.add(null);
    turnManager.endTurn();
    _serverChoice = null;
    _receiverChoice = null;
    _turnStartController.add(null);
  }

  /// Disposes of the stream controllers.
  /// Should be called when the match manager is no longer needed.
  void dispose() {
    _turnStartController.close();
    _turnEndController.close();
  }
}
