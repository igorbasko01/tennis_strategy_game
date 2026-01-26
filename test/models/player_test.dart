import 'package:flutter_test/flutter_test.dart';
import 'package:tennis_strategy_game/models/player.dart';

void main() {
  group('Player', () {
    group('construction', () {
      test('creates player with valid skill range', () {
        const player = Player(id: '1', name: 'Roger', skill: 0.7);

        expect(player.id, equals('1'));
        expect(player.name, equals('Roger'));
        expect(player.skill, equals(0.7));
      });

      test('allows minimum skill value of 0.0', () {
        const player = Player(id: '1', name: 'Beginner', skill: 0.0);
        expect(player.skill, equals(0.0));
      });

      test('allows maximum skill value of 1.0', () {
        const player = Player(id: '1', name: 'Pro', skill: 1.0);
        expect(player.skill, equals(1.0));
      });
    });

    group('equality', () {
      test('two players with same values are equal', () {
        const player1 = Player(id: '1', name: 'Roger', skill: 0.7);
        const player2 = Player(id: '1', name: 'Roger', skill: 0.7);

        expect(player1, equals(player2));
      });

      test('two players with different ids are not equal', () {
        const player1 = Player(id: '1', name: 'Roger', skill: 0.7);
        const player2 = Player(id: '2', name: 'Roger', skill: 0.7);

        expect(player1, isNot(equals(player2)));
      });

      test('two players with different names are not equal', () {
        const player1 = Player(id: '1', name: 'Roger', skill: 0.7);
        const player2 = Player(id: '1', name: 'Rafa', skill: 0.7);

        expect(player1, isNot(equals(player2)));
      });

      test('two players with different skills are not equal', () {
        const player1 = Player(id: '1', name: 'Roger', skill: 0.7);
        const player2 = Player(id: '1', name: 'Roger', skill: 0.8);

        expect(player1, isNot(equals(player2)));
      });
    });

    group('toString', () {
      test('returns readable string representation', () {
        const player = Player(id: '1', name: 'Roger', skill: 0.7);

        expect(
          player.toString(),
          equals('Player(id: 1, name: Roger, skill: 0.7)'),
        );
      });
    });

    group('hashCode', () {
      test('equal players have same hashCode', () {
        const player1 = Player(id: '1', name: 'Roger', skill: 0.7);
        const player2 = Player(id: '1', name: 'Roger', skill: 0.7);

        expect(player1.hashCode, equals(player2.hashCode));
      });
    });
  });
}
