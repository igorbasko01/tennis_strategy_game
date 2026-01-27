import 'package:flutter_test/flutter_test.dart';
import 'package:tennis_strategy_game/models/player.dart';
import 'package:tennis_strategy_game/models/turn_manager.dart';

void main() {
  group('TurnManager', () {
    late Player player1;
    late Player player2;

    setUp(() {
      player1 = const Player(id: '1', name: 'Roger', skill: 0.8);
      player2 = const Player(id: '2', name: 'Rafa', skill: 0.9);
    });

    group('construction', () {
      test('creates turn manager with initial server and receiver', () {
        final turnManager = TurnManager(
          initialServer: player1,
          initialReceiver: player2,
        );

        expect(turnManager.server, equals(player1));
        expect(turnManager.receiver, equals(player2));
      });

      test('can be created with reversed roles', () {
        final turnManager = TurnManager(
          initialServer: player2,
          initialReceiver: player1,
        );

        expect(turnManager.server, equals(player2));
        expect(turnManager.receiver, equals(player1));
      });
    });

    group('endTurn', () {
      test('switches server to receiver', () {
        final turnManager = TurnManager(
          initialServer: player1,
          initialReceiver: player2,
        );

        turnManager.endTurn();

        expect(turnManager.server, equals(player2));
      });

      test('switches receiver to server', () {
        final turnManager = TurnManager(
          initialServer: player1,
          initialReceiver: player2,
        );

        turnManager.endTurn();

        expect(turnManager.receiver, equals(player1));
      });

      test('switches roles correctly after multiple turns', () {
        final turnManager = TurnManager(
          initialServer: player1,
          initialReceiver: player2,
        );

        // After first turn
        turnManager.endTurn();
        expect(turnManager.server, equals(player2));
        expect(turnManager.receiver, equals(player1));

        // After second turn
        turnManager.endTurn();
        expect(turnManager.server, equals(player1));
        expect(turnManager.receiver, equals(player2));

        // After third turn
        turnManager.endTurn();
        expect(turnManager.server, equals(player2));
        expect(turnManager.receiver, equals(player1));
      });
    });
  });
}
