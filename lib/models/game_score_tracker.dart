import 'dart:async';

import 'player.dart';

/// Represents the possible score values in a tennis game.
enum GameScore {
  love(0),
  fifteen(15),
  thirty(30),
  forty(40),
  advantage(-1),
  gameWon(-2);

  final int value;
  const GameScore(this.value);
}

/// Event emitted when the score is updated.
class ScoreUpdateEvent {
  final Player player1;
  final Player player2;
  final GameScore player1Score;
  final GameScore player2Score;
  final bool isDeuce;

  const ScoreUpdateEvent({
    required this.player1,
    required this.player2,
    required this.player1Score,
    required this.player2Score,
    required this.isDeuce,
  });

  @override
  String toString() => 'ScoreUpdateEvent(player1: ${player1.name} - $player1Score, '
      'player2: ${player2.name} - $player2Score, isDeuce: $isDeuce)';
}

/// Event emitted when the game ends.
class GameEndedEvent {
  final Player winner;

  const GameEndedEvent({required this.winner});

  @override
  String toString() => 'GameEndedEvent(winner: ${winner.name})';
}

/// Tracks the score for a single tennis game.
///
/// Handles:
/// - Basic scoring progression (0, 15, 30, 40)
/// - Deuce situations (when both players are at 40)
/// - Advantage scenarios (after deuce)
/// - Game completion
/// - Score update and game end events
class GameScoreTracker {
  /// The first player in the game.
  final Player player1;

  /// The second player in the game.
  final Player player2;

  /// Current score for player 1.
  GameScore _player1Score = GameScore.love;

  /// Current score for player 2.
  GameScore _player2Score = GameScore.love;

  /// Whether the game has ended.
  bool _gameEnded = false;

  /// Stream controller for score update events.
  final StreamController<ScoreUpdateEvent> _scoreUpdateController =
      StreamController<ScoreUpdateEvent>.broadcast();

  /// Stream controller for game ended events.
  final StreamController<GameEndedEvent> _gameEndedController =
      StreamController<GameEndedEvent>.broadcast();

  /// Stream that emits events when the score is updated.
  Stream<ScoreUpdateEvent> get onScoreUpdate => _scoreUpdateController.stream;

  /// Stream that emits events when the game ends.
  Stream<GameEndedEvent> get onGameEnded => _gameEndedController.stream;

  /// Creates a new GameScoreTracker for two players.
  GameScoreTracker({
    required this.player1,
    required this.player2,
  });

  /// Gets the current score for player 1.
  GameScore get player1Score => _player1Score;

  /// Gets the current score for player 2.
  GameScore get player2Score => _player2Score;

  /// Gets whether the game has ended.
  bool get isGameEnded => _gameEnded;

  /// Gets whether the current state is deuce (both players at 40).
  bool get isDeuce => 
      _player1Score == GameScore.forty && 
      _player2Score == GameScore.forty;

  /// Gets the winner if the game has ended, null otherwise.
  Player? get winner {
    if (!_gameEnded) return null;
    if (_player1Score == GameScore.gameWon) return player1;
    if (_player2Score == GameScore.gameWon) return player2;
    return null;
  }

  /// Awards a point to the specified player.
  ///
  /// Updates the score according to tennis rules:
  /// - Normal progression: 0 -> 15 -> 30 -> 40
  /// - At 40-X (where X < 40): player at 40 wins the game
  /// - At 40-40 (deuce): next point gives advantage
  /// - At advantage: if advantaged player wins, game ends; otherwise back to deuce
  ///
  /// Throws [StateError] if the game has already ended.
  void awardPoint(Player player) {
    if (_gameEnded) {
      throw StateError('Cannot award points after game has ended');
    }

    if (player == player1) {
      _awardPointToPlayer1();
    } else if (player == player2) {
      _awardPointToPlayer2();
    } else {
      throw ArgumentError('Player must be either player1 or player2');
    }

    _emitScoreUpdate();

    if (_gameEnded) {
      _emitGameEnded();
    }
  }

  void _awardPointToPlayer1() {
    // Handle advantage/deuce scenarios
    if (_player1Score == GameScore.advantage) {
      // Player 1 had advantage and wins the point -> game won
      _player1Score = GameScore.gameWon;
      _gameEnded = true;
      return;
    }

    if (_player2Score == GameScore.advantage) {
      // Player 2 had advantage, player 1 wins point -> back to deuce
      _player1Score = GameScore.forty;
      _player2Score = GameScore.forty;
      return;
    }

    // Handle 40-40 deuce
    if (_player1Score == GameScore.forty && _player2Score == GameScore.forty) {
      _player1Score = GameScore.advantage;
      return;
    }

    // Handle winning from 40
    if (_player1Score == GameScore.forty) {
      _player1Score = GameScore.gameWon;
      _gameEnded = true;
      return;
    }

    // Normal score progression
    _player1Score = _nextScore(_player1Score);
  }

  void _awardPointToPlayer2() {
    // Handle advantage/deuce scenarios
    if (_player2Score == GameScore.advantage) {
      // Player 2 had advantage and wins the point -> game won
      _player2Score = GameScore.gameWon;
      _gameEnded = true;
      return;
    }

    if (_player1Score == GameScore.advantage) {
      // Player 1 had advantage, player 2 wins point -> back to deuce
      _player1Score = GameScore.forty;
      _player2Score = GameScore.forty;
      return;
    }

    // Handle 40-40 deuce
    if (_player1Score == GameScore.forty && _player2Score == GameScore.forty) {
      _player2Score = GameScore.advantage;
      return;
    }

    // Handle winning from 40
    if (_player2Score == GameScore.forty) {
      _player2Score = GameScore.gameWon;
      _gameEnded = true;
      return;
    }

    // Normal score progression
    _player2Score = _nextScore(_player2Score);
  }

  GameScore _nextScore(GameScore current) {
    switch (current) {
      case GameScore.love:
        return GameScore.fifteen;
      case GameScore.fifteen:
        return GameScore.thirty;
      case GameScore.thirty:
        return GameScore.forty;
      case GameScore.forty:
      case GameScore.advantage:
      case GameScore.gameWon:
        return current; // Should not happen in normal flow
    }
  }

  void _emitScoreUpdate() {
    _scoreUpdateController.add(ScoreUpdateEvent(
      player1: player1,
      player2: player2,
      player1Score: _player1Score,
      player2Score: _player2Score,
      isDeuce: isDeuce,
    ));
  }

  void _emitGameEnded() {
    final gameWinner = winner;
    if (gameWinner != null) {
      _gameEndedController.add(GameEndedEvent(winner: gameWinner));
    }
  }

  /// Disposes of the stream controllers.
  /// Should be called when the score tracker is no longer needed.
  void dispose() {
    _scoreUpdateController.close();
    _gameEndedController.close();
  }
}
