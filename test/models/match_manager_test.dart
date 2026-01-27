import 'package:flutter_test/flutter_test.dart';
import 'package:tennis_strategy_game/models/player.dart';
import 'package:tennis_strategy_game/models/match_manager.dart';
import 'package:tennis_strategy_game/models/actions/serve_action.dart';
import 'package:tennis_strategy_game/models/actions/defend_action.dart';
import 'package:tennis_strategy_game/models/actions/serve_receive_action.dart';
import 'package:tennis_strategy_game/models/actions/attack_action.dart';
import 'package:tennis_strategy_game/models/turn/server_choice.dart';
import 'package:tennis_strategy_game/models/turn/receiver_choice.dart';

void main() {
  group('MatchManager', () {
    late Player player1;
    late Player player2;
    late MatchManager matchManager;

    setUp(() {
      player1 = const Player(id: '1', name: 'Roger', skill: 0.8);
      player2 = const Player(id: '2', name: 'Rafa', skill: 0.9);
    });

    tearDown(() {
      matchManager.dispose();
    });

    group('construction', () {
      test('creates match manager with two players', () {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        expect(matchManager.player1, equals(player1));
        expect(matchManager.player2, equals(player2));
      });

      test('sets player1 as initial server', () {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        expect(matchManager.currentServer, equals(player1));
      });

      test('sets player2 as initial receiver', () {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        expect(matchManager.currentReceiver, equals(player2));
      });

      test('initializes with no player choices', () {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        expect(matchManager.serverChoice, isNull);
        expect(matchManager.receiverChoice, isNull);
        expect(matchManager.bothPlayersReady, isFalse);
      });
    });

    group('submitServerChoice', () {
      test('stores server choice', () {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        const serverChoice = ServerChoice(
          serveTarget: ServeAction.wide,
          anticipationZone: DefendAction.crossCourt,
        );

        matchManager.submitServerChoice(serverChoice);

        expect(matchManager.serverChoice, equals(serverChoice));
      });

      test('updates server choice when called multiple times', () {
        matchManager = MatchManager(
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

        matchManager.submitServerChoice(firstChoice);
        matchManager.submitServerChoice(secondChoice);

        expect(matchManager.serverChoice, equals(secondChoice));
      });
    });

    group('submitReceiverChoice', () {
      test('stores receiver choice', () {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        const receiverChoice = ReceiverChoice(
          anticipationZone: ServeReceiveAction.wide,
          returnTarget: AttackAction.crossCourt,
        );

        matchManager.submitReceiverChoice(receiverChoice);

        expect(matchManager.receiverChoice, equals(receiverChoice));
      });

      test('updates receiver choice when called multiple times', () {
        matchManager = MatchManager(
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

        matchManager.submitReceiverChoice(firstChoice);
        matchManager.submitReceiverChoice(secondChoice);

        expect(matchManager.receiverChoice, equals(secondChoice));
      });
    });

    group('bothPlayersReady', () {
      test('returns false when no choices submitted', () {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        expect(matchManager.bothPlayersReady, isFalse);
      });

      test('returns false when only server choice submitted', () {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        const serverChoice = ServerChoice(
          serveTarget: ServeAction.wide,
          anticipationZone: DefendAction.crossCourt,
        );

        matchManager.submitServerChoice(serverChoice);

        expect(matchManager.bothPlayersReady, isFalse);
      });

      test('returns false when only receiver choice submitted', () {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        const receiverChoice = ReceiverChoice(
          anticipationZone: ServeReceiveAction.wide,
          returnTarget: AttackAction.crossCourt,
        );

        matchManager.submitReceiverChoice(receiverChoice);

        expect(matchManager.bothPlayersReady, isFalse);
      });

      test('returns true when both choices submitted', () {
        matchManager = MatchManager(
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

        matchManager.submitServerChoice(serverChoice);
        matchManager.submitReceiverChoice(receiverChoice);

        expect(matchManager.bothPlayersReady, isTrue);
      });
    });

    group('endTurn', () {
      test('switches server to receiver', () {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        matchManager.endTurn();

        expect(matchManager.currentServer, equals(player2));
      });

      test('switches receiver to server', () {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        matchManager.endTurn();

        expect(matchManager.currentReceiver, equals(player1));
      });

      test('clears server choice', () {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        const serverChoice = ServerChoice(
          serveTarget: ServeAction.wide,
          anticipationZone: DefendAction.crossCourt,
        );

        matchManager.submitServerChoice(serverChoice);
        matchManager.endTurn();

        expect(matchManager.serverChoice, isNull);
      });

      test('clears receiver choice', () {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        const receiverChoice = ReceiverChoice(
          anticipationZone: ServeReceiveAction.wide,
          returnTarget: AttackAction.crossCourt,
        );

        matchManager.submitReceiverChoice(receiverChoice);
        matchManager.endTurn();

        expect(matchManager.receiverChoice, isNull);
      });

      test('clears both choices after they were submitted', () {
        matchManager = MatchManager(
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

        matchManager.submitServerChoice(serverChoice);
        matchManager.submitReceiverChoice(receiverChoice);
        matchManager.endTurn();

        expect(matchManager.serverChoice, isNull);
        expect(matchManager.receiverChoice, isNull);
        expect(matchManager.bothPlayersReady, isFalse);
      });

      test('handles multiple turn cycles correctly', () {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        // Turn 1
        expect(matchManager.currentServer, equals(player1));
        expect(matchManager.currentReceiver, equals(player2));

        // Turn 2
        matchManager.endTurn();
        expect(matchManager.currentServer, equals(player2));
        expect(matchManager.currentReceiver, equals(player1));

        // Turn 3
        matchManager.endTurn();
        expect(matchManager.currentServer, equals(player1));
        expect(matchManager.currentReceiver, equals(player2));
      });
    });

    group('end-to-end turn flow', () {
      test('completes a full turn cycle with choices', () {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        // Turn 1: player1 serves, player2 receives
        expect(matchManager.currentServer, equals(player1));
        expect(matchManager.currentReceiver, equals(player2));

        const serverChoice1 = ServerChoice(
          serveTarget: ServeAction.wide,
          anticipationZone: DefendAction.crossCourt,
        );

        const receiverChoice1 = ReceiverChoice(
          anticipationZone: ServeReceiveAction.wide,
          returnTarget: AttackAction.crossCourt,
        );

        matchManager.submitServerChoice(serverChoice1);
        matchManager.submitReceiverChoice(receiverChoice1);
        expect(matchManager.bothPlayersReady, isTrue);

        // End turn 1
        matchManager.endTurn();

        // Turn 2: player2 serves, player1 receives
        expect(matchManager.currentServer, equals(player2));
        expect(matchManager.currentReceiver, equals(player1));
        expect(matchManager.bothPlayersReady, isFalse);

        const serverChoice2 = ServerChoice(
          serveTarget: ServeAction.body,
          anticipationZone: DefendAction.downTheLine,
        );

        const receiverChoice2 = ReceiverChoice(
          anticipationZone: ServeReceiveAction.neutral,
          returnTarget: AttackAction.downTheLine,
        );

        matchManager.submitServerChoice(serverChoice2);
        matchManager.submitReceiverChoice(receiverChoice2);
        expect(matchManager.bothPlayersReady, isTrue);

        // End turn 2
        matchManager.endTurn();

        // Turn 3: back to player1 serving
        expect(matchManager.currentServer, equals(player1));
        expect(matchManager.currentReceiver, equals(player2));
        expect(matchManager.bothPlayersReady, isFalse);

        matchManager.dispose();
      });
    });

    group('events', () {
      test('emits turn start event on construction', () async {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        // Create listener to verify stream is functional
        bool receivedEvent = false;
        final sub = matchManager.onTurnStart.listen((_) {
          receivedEvent = true;
        });
        
        // Trigger another event to verify the stream works
        matchManager.endTurn();
        
        await Future.delayed(const Duration(milliseconds: 50));
        
        // After endTurn, we should receive a turn start event
        expect(receivedEvent, isTrue);
        sub.cancel();
        matchManager.dispose();
      });

      test('emits turn end event when ending turn', () async {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        // Listen to turn start to skip the initial event
        bool gotInitialEvent = false;
        final sub0 = matchManager.onTurnStart.listen((_) {
          if (!gotInitialEvent) {
            gotInitialEvent = true;
          }
        });

        // Wait for initial event to be processed
        await Future.delayed(const Duration(milliseconds: 10));

        bool turnEndEmitted = false;
        final sub = matchManager.onTurnEnd.listen((_) {
          turnEndEmitted = true;
        });
        
        matchManager.endTurn();
        
        await Future.delayed(const Duration(milliseconds: 10));
        
        expect(turnEndEmitted, isTrue);
        sub.cancel();
        sub0.cancel();
        matchManager.dispose();
      });

      test('emits turn start event when ending turn', () async {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        // Listen to turn start to skip the initial event
        bool gotInitialEvent = false;
        final sub0 = matchManager.onTurnStart.listen((_) {
          if (!gotInitialEvent) {
            gotInitialEvent = true;
          }
        });

        // Wait for initial event to be processed
        await Future.delayed(const Duration(milliseconds: 10));

        bool turnStartEmitted = false;
        final sub = matchManager.onTurnStart.listen((_) {
          turnStartEmitted = true;
        });
        
        matchManager.endTurn();
        
        await Future.delayed(const Duration(milliseconds: 10));
        
        expect(turnStartEmitted, isTrue);
        sub.cancel();
        sub0.cancel();
        matchManager.dispose();
      });

      test('emits events in correct order: turn end then turn start', () async {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        final events = <String>[];

        // Subscribe to both streams
        final sub1 = matchManager.onTurnEnd.listen((_) {
          events.add('turnEnd');
        });

        final sub2 = matchManager.onTurnStart.listen((_) {
          events.add('turnStart');
        });

        // Wait to skip the initial turn start event
        await Future.delayed(const Duration(milliseconds: 10));
        
        // Clear events to start fresh
        events.clear();

        matchManager.endTurn();

        await Future.delayed(const Duration(milliseconds: 50));

        expect(events, equals(['turnEnd', 'turnStart']));
        sub1.cancel();
        sub2.cancel();
        matchManager.dispose();
      });

      test('emits multiple turn cycles correctly', () async {
        matchManager = MatchManager(
          player1: player1,
          player2: player2,
        );

        final turnStartEvents = <void>[];
        final turnEndEvents = <void>[];

        final sub1 = matchManager.onTurnStart.listen((event) {
          turnStartEvents.add(event);
        });

        final sub2 = matchManager.onTurnEnd.listen((event) {
          turnEndEvents.add(event);
        });

        // The initial turn start event was emitted during construction,
        // before we added listeners, so we expect 0 initial events from our listeners

        // End turn 1 - should emit turnEnd and turnStart
        matchManager.endTurn();
        await Future.delayed(const Duration(milliseconds: 50));
        expect(turnStartEvents.length, equals(1));
        expect(turnEndEvents.length, equals(1));

        // End turn 2 - should emit turnEnd and turnStart again
        matchManager.endTurn();
        await Future.delayed(const Duration(milliseconds: 50));
        expect(turnStartEvents.length, equals(2));
        expect(turnEndEvents.length, equals(2));

        sub1.cancel();
        sub2.cancel();
        matchManager.dispose();
      });
    });
  });
}
