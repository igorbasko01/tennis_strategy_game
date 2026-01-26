import 'package:flutter_test/flutter_test.dart';
import 'package:tennis_strategy_game/models/player.dart';
import 'package:tennis_strategy_game/models/point_result.dart';

void main() {
  group('PointResult', () {
    final testPlayer = Player(id: '1', name: 'Test Player', skill: 0.5);

    group('isFinished getter', () {
      test('returns true when server wins', () {
        const result = PointResult(outcome: PointOutcome.serverWins);
        expect(result.isFinished, isTrue);
      });

      test('returns true when receiver wins', () {
        const result = PointResult(outcome: PointOutcome.receiverWins);
        expect(result.isFinished, isTrue);
      });

      test('returns false when rally continues', () {
        const result = PointResult(outcome: PointOutcome.rallyContinues);
        expect(result.isFinished, isFalse);
      });
    });

    group('named constructors', () {
      test('serverWins creates correct outcome', () {
        final result = PointResult.serverWins(
          winner: testPlayer,
          description: 'Ace!',
        );

        expect(result.outcome, equals(PointOutcome.serverWins));
        expect(result.winner, equals(testPlayer));
        expect(result.description, equals('Ace!'));
        expect(result.isFinished, isTrue);
      });

      test('receiverWins creates correct outcome', () {
        final result = PointResult.receiverWins(
          winner: testPlayer,
          description: 'Return winner!',
        );

        expect(result.outcome, equals(PointOutcome.receiverWins));
        expect(result.winner, equals(testPlayer));
        expect(result.description, equals('Return winner!'));
        expect(result.isFinished, isTrue);
      });

      test('rallyContinues creates correct outcome with null winner', () {
        const result = PointResult.rallyContinues(description: 'Ball in play');

        expect(result.outcome, equals(PointOutcome.rallyContinues));
        expect(result.winner, isNull);
        expect(result.description, equals('Ball in play'));
        expect(result.isFinished, isFalse);
      });

      test('serverWins works without optional parameters', () {
        const result = PointResult.serverWins();

        expect(result.outcome, equals(PointOutcome.serverWins));
        expect(result.winner, isNull);
        expect(result.description, isNull);
      });

      test('receiverWins works without optional parameters', () {
        const result = PointResult.receiverWins();

        expect(result.outcome, equals(PointOutcome.receiverWins));
        expect(result.winner, isNull);
        expect(result.description, isNull);
      });

      test('rallyContinues works without optional parameters', () {
        const result = PointResult.rallyContinues();

        expect(result.outcome, equals(PointOutcome.rallyContinues));
        expect(result.winner, isNull);
        expect(result.description, isNull);
      });
    });

    group('equality', () {
      test('two results with same values are equal', () {
        final result1 = PointResult.serverWins(
          winner: testPlayer,
          description: 'Ace!',
        );
        final result2 = PointResult.serverWins(
          winner: testPlayer,
          description: 'Ace!',
        );

        expect(result1, equals(result2));
      });

      test('two results with different outcomes are not equal', () {
        final result1 = PointResult.serverWins(winner: testPlayer);
        final result2 = PointResult.receiverWins(winner: testPlayer);

        expect(result1, isNot(equals(result2)));
      });

      test('two results with different descriptions are not equal', () {
        const result1 = PointResult.serverWins(description: 'Ace!');
        const result2 = PointResult.serverWins(description: 'Winner!');

        expect(result1, isNot(equals(result2)));
      });
    });
  });
}
