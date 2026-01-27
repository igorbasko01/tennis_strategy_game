import 'package:flutter_test/flutter_test.dart';
import 'package:tennis_strategy_game/models/models.dart';

void main() {
  group('GameScoreTracker', () {
    late Player player1;
    late Player player2;
    late GameScoreTracker tracker;

    setUp(() {
      player1 = const Player(id: '1', name: 'Player 1', skill: 0.7);
      player2 = const Player(id: '2', name: 'Player 2', skill: 0.8);
      tracker = GameScoreTracker(player1: player1, player2: player2);
    });

    tearDown(() {
      tracker.dispose();
    });

    group('initialization', () {
      test('starts with both players at love', () {
        expect(tracker.player1Score, equals(GameScore.love));
        expect(tracker.player2Score, equals(GameScore.love));
      });

      test('starts with game not ended', () {
        expect(tracker.isGameEnded, isFalse);
      });

      test('starts with no winner', () {
        expect(tracker.winner, isNull);
      });

      test('starts with no deuce', () {
        expect(tracker.isDeuce, isFalse);
      });
    });

    group('basic scoring progression', () {
      test('player1 scores: love -> 15', () {
        tracker.awardPoint(player1);
        expect(tracker.player1Score, equals(GameScore.fifteen));
        expect(tracker.player2Score, equals(GameScore.love));
      });

      test('player1 scores: love -> 15 -> 30', () {
        tracker.awardPoint(player1);
        tracker.awardPoint(player1);
        expect(tracker.player1Score, equals(GameScore.thirty));
        expect(tracker.player2Score, equals(GameScore.love));
      });

      test('player1 scores: love -> 15 -> 30 -> 40', () {
        tracker.awardPoint(player1);
        tracker.awardPoint(player1);
        tracker.awardPoint(player1);
        expect(tracker.player1Score, equals(GameScore.forty));
        expect(tracker.player2Score, equals(GameScore.love));
      });

      test('player2 scores: love -> 15 -> 30 -> 40', () {
        tracker.awardPoint(player2);
        tracker.awardPoint(player2);
        tracker.awardPoint(player2);
        expect(tracker.player1Score, equals(GameScore.love));
        expect(tracker.player2Score, equals(GameScore.forty));
      });

      test('alternating scores work correctly', () {
        tracker.awardPoint(player1); // 15-0
        tracker.awardPoint(player2); // 15-15
        tracker.awardPoint(player1); // 30-15
        tracker.awardPoint(player2); // 30-30
        
        expect(tracker.player1Score, equals(GameScore.thirty));
        expect(tracker.player2Score, equals(GameScore.thirty));
      });
    });

    group('winning the game', () {
      test('player1 wins from 40-0', () {
        tracker.awardPoint(player1); // 15-0
        tracker.awardPoint(player1); // 30-0
        tracker.awardPoint(player1); // 40-0
        tracker.awardPoint(player1); // Game
        
        expect(tracker.player1Score, equals(GameScore.gameWon));
        expect(tracker.isGameEnded, isTrue);
        expect(tracker.winner, equals(player1));
      });

      test('player2 wins from 0-40', () {
        tracker.awardPoint(player2); // 0-15
        tracker.awardPoint(player2); // 0-30
        tracker.awardPoint(player2); // 0-40
        tracker.awardPoint(player2); // Game
        
        expect(tracker.player2Score, equals(GameScore.gameWon));
        expect(tracker.isGameEnded, isTrue);
        expect(tracker.winner, equals(player2));
      });

      test('player1 wins from 40-30', () {
        tracker.awardPoint(player1); // 15-0
        tracker.awardPoint(player1); // 30-0
        tracker.awardPoint(player2); // 30-15
        tracker.awardPoint(player1); // 40-15
        tracker.awardPoint(player2); // 40-30
        tracker.awardPoint(player1); // Game
        
        expect(tracker.player1Score, equals(GameScore.gameWon));
        expect(tracker.isGameEnded, isTrue);
        expect(tracker.winner, equals(player1));
      });

      test('cannot award points after game has ended', () {
        tracker.awardPoint(player1);
        tracker.awardPoint(player1);
        tracker.awardPoint(player1);
        tracker.awardPoint(player1); // Game won
        
        expect(
          () => tracker.awardPoint(player1),
          throwsStateError,
        );
      });
    });

    group('deuce handling', () {
      test('40-40 is deuce', () {
        tracker.awardPoint(player1); // 15-0
        tracker.awardPoint(player1); // 30-0
        tracker.awardPoint(player1); // 40-0
        tracker.awardPoint(player2); // 40-15
        tracker.awardPoint(player2); // 40-30
        tracker.awardPoint(player2); // 40-40
        
        expect(tracker.isDeuce, isTrue);
        expect(tracker.player1Score, equals(GameScore.forty));
        expect(tracker.player2Score, equals(GameScore.forty));
      });

      test('player1 gets advantage from deuce', () {
        // Set up deuce
        tracker.awardPoint(player1); // 15-0
        tracker.awardPoint(player1); // 30-0
        tracker.awardPoint(player1); // 40-0
        tracker.awardPoint(player2); // 40-15
        tracker.awardPoint(player2); // 40-30
        tracker.awardPoint(player2); // 40-40 (deuce)
        
        tracker.awardPoint(player1); // Advantage player1
        
        expect(tracker.player1Score, equals(GameScore.advantage));
        expect(tracker.player2Score, equals(GameScore.forty));
        expect(tracker.isDeuce, isFalse);
      });

      test('player2 gets advantage from deuce', () {
        // Set up deuce
        tracker.awardPoint(player1); // 15-0
        tracker.awardPoint(player1); // 30-0
        tracker.awardPoint(player1); // 40-0
        tracker.awardPoint(player2); // 40-15
        tracker.awardPoint(player2); // 40-30
        tracker.awardPoint(player2); // 40-40 (deuce)
        
        tracker.awardPoint(player2); // Advantage player2
        
        expect(tracker.player1Score, equals(GameScore.forty));
        expect(tracker.player2Score, equals(GameScore.advantage));
        expect(tracker.isDeuce, isFalse);
      });
    });

    group('advantage handling', () {
      test('player1 wins from advantage', () {
        // Set up advantage for player1
        tracker.awardPoint(player1); // 15-0
        tracker.awardPoint(player1); // 30-0
        tracker.awardPoint(player1); // 40-0
        tracker.awardPoint(player2); // 40-15
        tracker.awardPoint(player2); // 40-30
        tracker.awardPoint(player2); // 40-40 (deuce)
        tracker.awardPoint(player1); // Advantage player1
        
        tracker.awardPoint(player1); // Game won
        
        expect(tracker.player1Score, equals(GameScore.gameWon));
        expect(tracker.isGameEnded, isTrue);
        expect(tracker.winner, equals(player1));
      });

      test('player2 wins from advantage', () {
        // Set up advantage for player2
        tracker.awardPoint(player1); // 15-0
        tracker.awardPoint(player1); // 30-0
        tracker.awardPoint(player1); // 40-0
        tracker.awardPoint(player2); // 40-15
        tracker.awardPoint(player2); // 40-30
        tracker.awardPoint(player2); // 40-40 (deuce)
        tracker.awardPoint(player2); // Advantage player2
        
        tracker.awardPoint(player2); // Game won
        
        expect(tracker.player2Score, equals(GameScore.gameWon));
        expect(tracker.isGameEnded, isTrue);
        expect(tracker.winner, equals(player2));
      });

      test('advantage goes back to deuce when opponent scores', () {
        // Set up advantage for player1
        tracker.awardPoint(player1); // 15-0
        tracker.awardPoint(player1); // 30-0
        tracker.awardPoint(player1); // 40-0
        tracker.awardPoint(player2); // 40-15
        tracker.awardPoint(player2); // 40-30
        tracker.awardPoint(player2); // 40-40 (deuce)
        tracker.awardPoint(player1); // Advantage player1
        
        tracker.awardPoint(player2); // Back to deuce
        
        expect(tracker.player1Score, equals(GameScore.forty));
        expect(tracker.player2Score, equals(GameScore.forty));
        expect(tracker.isDeuce, isTrue);
      });

      test('multiple deuce-advantage cycles', () {
        // Set up deuce
        tracker.awardPoint(player1); // 15-0
        tracker.awardPoint(player1); // 30-0
        tracker.awardPoint(player1); // 40-0
        tracker.awardPoint(player2); // 40-15
        tracker.awardPoint(player2); // 40-30
        tracker.awardPoint(player2); // 40-40 (deuce)
        
        // First cycle: player1 advantage -> back to deuce
        tracker.awardPoint(player1); // Advantage player1
        expect(tracker.player1Score, equals(GameScore.advantage));
        tracker.awardPoint(player2); // Back to deuce
        expect(tracker.isDeuce, isTrue);
        
        // Second cycle: player2 advantage -> back to deuce
        tracker.awardPoint(player2); // Advantage player2
        expect(tracker.player2Score, equals(GameScore.advantage));
        tracker.awardPoint(player1); // Back to deuce
        expect(tracker.isDeuce, isTrue);
        
        // Third cycle: player1 advantage -> wins
        tracker.awardPoint(player1); // Advantage player1
        tracker.awardPoint(player1); // Game won
        expect(tracker.player1Score, equals(GameScore.gameWon));
        expect(tracker.winner, equals(player1));
      });
    });

    group('score update events', () {
      test('emits score update event when point is awarded', () async {
        final events = <ScoreUpdateEvent>[];
        tracker.onScoreUpdate.listen(events.add);
        
        tracker.awardPoint(player1);
        
        await Future.delayed(Duration.zero); // Allow event to propagate
        
        expect(events.length, equals(1));
        expect(events[0].player1Score, equals(GameScore.fifteen));
        expect(events[0].player2Score, equals(GameScore.love));
        expect(events[0].isDeuce, isFalse);
      });

      test('emits multiple score update events', () async {
        final events = <ScoreUpdateEvent>[];
        tracker.onScoreUpdate.listen(events.add);
        
        tracker.awardPoint(player1); // 15-0
        tracker.awardPoint(player2); // 15-15
        tracker.awardPoint(player1); // 30-15
        
        await Future.delayed(Duration.zero);
        
        expect(events.length, equals(3));
        expect(events[0].player1Score, equals(GameScore.fifteen));
        expect(events[0].player2Score, equals(GameScore.love));
        expect(events[1].player1Score, equals(GameScore.fifteen));
        expect(events[1].player2Score, equals(GameScore.fifteen));
        expect(events[2].player1Score, equals(GameScore.thirty));
        expect(events[2].player2Score, equals(GameScore.fifteen));
      });

      test('score update event indicates deuce', () async {
        final events = <ScoreUpdateEvent>[];
        tracker.onScoreUpdate.listen(events.add);
        
        // Set up deuce
        tracker.awardPoint(player1); // 15-0
        tracker.awardPoint(player1); // 30-0
        tracker.awardPoint(player1); // 40-0
        tracker.awardPoint(player2); // 40-15
        tracker.awardPoint(player2); // 40-30
        tracker.awardPoint(player2); // 40-40 (deuce)
        
        await Future.delayed(Duration.zero);
        
        final deuceEvent = events.last;
        expect(deuceEvent.isDeuce, isTrue);
        expect(deuceEvent.player1Score, equals(GameScore.forty));
        expect(deuceEvent.player2Score, equals(GameScore.forty));
      });
    });

    group('game ended events', () {
      test('emits game ended event when game is won', () async {
        final events = <GameEndedEvent>[];
        tracker.onGameEnded.listen(events.add);
        
        tracker.awardPoint(player1); // 15-0
        tracker.awardPoint(player1); // 30-0
        tracker.awardPoint(player1); // 40-0
        tracker.awardPoint(player1); // Game won
        
        await Future.delayed(Duration.zero);
        
        expect(events.length, equals(1));
        expect(events[0].winner, equals(player1));
      });

      test('does not emit game ended event during normal play', () async {
        final events = <GameEndedEvent>[];
        tracker.onGameEnded.listen(events.add);
        
        tracker.awardPoint(player1); // 15-0
        tracker.awardPoint(player2); // 15-15
        tracker.awardPoint(player1); // 30-15
        
        await Future.delayed(Duration.zero);
        
        expect(events.length, equals(0));
      });

      test('emits game ended event after deuce and advantage', () async {
        final events = <GameEndedEvent>[];
        tracker.onGameEnded.listen(events.add);
        
        // Set up deuce
        tracker.awardPoint(player1); // 15-0
        tracker.awardPoint(player1); // 30-0
        tracker.awardPoint(player1); // 40-0
        tracker.awardPoint(player2); // 40-15
        tracker.awardPoint(player2); // 40-30
        tracker.awardPoint(player2); // 40-40 (deuce)
        tracker.awardPoint(player1); // Advantage player1
        tracker.awardPoint(player1); // Game won
        
        await Future.delayed(Duration.zero);
        
        expect(events.length, equals(1));
        expect(events[0].winner, equals(player1));
      });
    });

    group('error handling', () {
      test('throws ArgumentError for invalid player', () {
        final invalidPlayer = const Player(id: '3', name: 'Invalid', skill: 0.5);
        
        expect(
          () => tracker.awardPoint(invalidPlayer),
          throwsArgumentError,
        );
      });
    });
  });
}
