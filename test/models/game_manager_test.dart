import 'package:flutter_test/flutter_test.dart';
import 'package:tennis_strategy_game/models/player.dart';
import 'package:tennis_strategy_game/models/game_manager.dart';
import 'package:tennis_strategy_game/models/actions/serve_action.dart';
import 'package:tennis_strategy_game/models/actions/defend_action.dart';
import 'package:tennis_strategy_game/models/actions/serve_receive_action.dart';
import 'package:tennis_strategy_game/models/actions/attack_action.dart';
import 'package:tennis_strategy_game/models/turn/server_choice.dart';
import 'package:tennis_strategy_game/models/turn/receiver_choice.dart';

void main() {
  group('GameManager', () {
    late Player player1;
    late Player player2;

    setUp(() {
      player1 = const Player(id: '1', name: 'Roger', skill: 0.8);
      player2 = const Player(id: '2', name: 'Rafa', skill: 0.9);
    });

    group('construction', () {
      test('creates game manager with two players', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        expect(gameManager.player1, equals(player1));
        expect(gameManager.player2, equals(player2));
      });

      test('sets player1 as initial server', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        expect(gameManager.currentServer, equals(player1));
      });

      test('sets player2 as initial receiver', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        expect(gameManager.currentReceiver, equals(player2));
      });

      test('initializes with no player choices', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        expect(gameManager.serverChoice, isNull);
        expect(gameManager.receiverChoice, isNull);
        expect(gameManager.bothPlayersReady, isFalse);
      });
    });

    group('submitServerChoice', () {
      test('stores server choice', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        const serverChoice = ServerChoice(
          serveTarget: ServeAction.wide,
          anticipationZone: DefendAction.crossCourt,
        );

        gameManager.submitServerChoice(serverChoice);

        expect(gameManager.serverChoice, equals(serverChoice));
      });

      test('updates server choice when called multiple times', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        const firstChoice = ServerChoice(
          serveTarget: ServeAction.wide,
          anticipationZone: DefendAction.crossCourt,
        );

        const secondChoice = ServerChoice(
          serveTarget: ServeAction.body,
          anticipationZone: DefendAction.downTheLine,
        );

        gameManager.submitServerChoice(firstChoice);
        gameManager.submitServerChoice(secondChoice);

        expect(gameManager.serverChoice, equals(secondChoice));
      });
    });

    group('submitReceiverChoice', () {
      test('stores receiver choice', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        const receiverChoice = ReceiverChoice(
          anticipationZone: ServeReceiveAction.wide,
          returnTarget: AttackAction.crossCourt,
        );

        gameManager.submitReceiverChoice(receiverChoice);

        expect(gameManager.receiverChoice, equals(receiverChoice));
      });

      test('updates receiver choice when called multiple times', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        const firstChoice = ReceiverChoice(
          anticipationZone: ServeReceiveAction.wide,
          returnTarget: AttackAction.crossCourt,
        );

        const secondChoice = ReceiverChoice(
          anticipationZone: ServeReceiveAction.neutral,
          returnTarget: AttackAction.downTheLine,
        );

        gameManager.submitReceiverChoice(firstChoice);
        gameManager.submitReceiverChoice(secondChoice);

        expect(gameManager.receiverChoice, equals(secondChoice));
      });
    });

    group('bothPlayersReady', () {
      test('returns false when no choices submitted', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        expect(gameManager.bothPlayersReady, isFalse);
      });

      test('returns false when only server choice submitted', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        const serverChoice = ServerChoice(
          serveTarget: ServeAction.wide,
          anticipationZone: DefendAction.crossCourt,
        );

        gameManager.submitServerChoice(serverChoice);

        expect(gameManager.bothPlayersReady, isFalse);
      });

      test('returns false when only receiver choice submitted', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        const receiverChoice = ReceiverChoice(
          anticipationZone: ServeReceiveAction.wide,
          returnTarget: AttackAction.crossCourt,
        );

        gameManager.submitReceiverChoice(receiverChoice);

        expect(gameManager.bothPlayersReady, isFalse);
      });

      test('returns true when both choices submitted', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        const serverChoice = ServerChoice(
          serveTarget: ServeAction.wide,
          anticipationZone: DefendAction.crossCourt,
        );

        const receiverChoice = ReceiverChoice(
          anticipationZone: ServeReceiveAction.wide,
          returnTarget: AttackAction.crossCourt,
        );

        gameManager.submitServerChoice(serverChoice);
        gameManager.submitReceiverChoice(receiverChoice);

        expect(gameManager.bothPlayersReady, isTrue);
      });
    });

    group('endTurn', () {
      test('switches server to receiver', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        gameManager.endTurn();

        expect(gameManager.currentServer, equals(player2));
      });

      test('switches receiver to server', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        gameManager.endTurn();

        expect(gameManager.currentReceiver, equals(player1));
      });

      test('clears server choice', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        const serverChoice = ServerChoice(
          serveTarget: ServeAction.wide,
          anticipationZone: DefendAction.crossCourt,
        );

        gameManager.submitServerChoice(serverChoice);
        gameManager.endTurn();

        expect(gameManager.serverChoice, isNull);
      });

      test('clears receiver choice', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        const receiverChoice = ReceiverChoice(
          anticipationZone: ServeReceiveAction.wide,
          returnTarget: AttackAction.crossCourt,
        );

        gameManager.submitReceiverChoice(receiverChoice);
        gameManager.endTurn();

        expect(gameManager.receiverChoice, isNull);
      });

      test('clears both choices after they were submitted', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        const serverChoice = ServerChoice(
          serveTarget: ServeAction.wide,
          anticipationZone: DefendAction.crossCourt,
        );

        const receiverChoice = ReceiverChoice(
          anticipationZone: ServeReceiveAction.wide,
          returnTarget: AttackAction.crossCourt,
        );

        gameManager.submitServerChoice(serverChoice);
        gameManager.submitReceiverChoice(receiverChoice);
        gameManager.endTurn();

        expect(gameManager.serverChoice, isNull);
        expect(gameManager.receiverChoice, isNull);
        expect(gameManager.bothPlayersReady, isFalse);
      });

      test('handles multiple turn cycles correctly', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        // Turn 1
        expect(gameManager.currentServer, equals(player1));
        expect(gameManager.currentReceiver, equals(player2));

        // Turn 2
        gameManager.endTurn();
        expect(gameManager.currentServer, equals(player2));
        expect(gameManager.currentReceiver, equals(player1));

        // Turn 3
        gameManager.endTurn();
        expect(gameManager.currentServer, equals(player1));
        expect(gameManager.currentReceiver, equals(player2));
      });
    });

    group('end-to-end turn flow', () {
      test('completes a full turn cycle with choices', () {
        final gameManager = GameManager(
          player1: player1,
          player2: player2,
        );

        // Turn 1: player1 serves, player2 receives
        expect(gameManager.currentServer, equals(player1));
        expect(gameManager.currentReceiver, equals(player2));

        const serverChoice1 = ServerChoice(
          serveTarget: ServeAction.wide,
          anticipationZone: DefendAction.crossCourt,
        );

        const receiverChoice1 = ReceiverChoice(
          anticipationZone: ServeReceiveAction.wide,
          returnTarget: AttackAction.crossCourt,
        );

        gameManager.submitServerChoice(serverChoice1);
        gameManager.submitReceiverChoice(receiverChoice1);
        expect(gameManager.bothPlayersReady, isTrue);

        // End turn 1
        gameManager.endTurn();

        // Turn 2: player2 serves, player1 receives
        expect(gameManager.currentServer, equals(player2));
        expect(gameManager.currentReceiver, equals(player1));
        expect(gameManager.bothPlayersReady, isFalse);

        const serverChoice2 = ServerChoice(
          serveTarget: ServeAction.body,
          anticipationZone: DefendAction.downTheLine,
        );

        const receiverChoice2 = ReceiverChoice(
          anticipationZone: ServeReceiveAction.neutral,
          returnTarget: AttackAction.downTheLine,
        );

        gameManager.submitServerChoice(serverChoice2);
        gameManager.submitReceiverChoice(receiverChoice2);
        expect(gameManager.bothPlayersReady, isTrue);

        // End turn 2
        gameManager.endTurn();

        // Turn 3: back to player1 serving
        expect(gameManager.currentServer, equals(player1));
        expect(gameManager.currentReceiver, equals(player2));
        expect(gameManager.bothPlayersReady, isFalse);
      });
    });
  });
}
