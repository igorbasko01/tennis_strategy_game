import 'package:flutter_test/flutter_test.dart';
import 'package:tennis_strategy_game/models/actions/serve_action.dart';
import 'package:tennis_strategy_game/models/actions/serve_receive_action.dart';

void main() {
  group('ServeReceiveAction', () {
    group('getModifierAgainst', () {
      group('against ServeAction.wide', () {
        test('wide receive gives +0.3 bonus (correct anticipation)', () {
          expect(
            ServeReceiveAction.wide.getModifierAgainst(ServeAction.wide),
            0.3,
          );
        });

        test('neutral receive gives -0.3 penalty (slight miss)', () {
          expect(
            ServeReceiveAction.neutral.getModifierAgainst(ServeAction.wide),
            -0.3,
          );
        });

        test('tLine receive gives -0.6 penalty (wrong side)', () {
          expect(
            ServeReceiveAction.tLine.getModifierAgainst(ServeAction.wide),
            -0.6,
          );
        });
      });

      group('against ServeAction.body', () {
        test('wide receive gives -0.3 penalty', () {
          expect(
            ServeReceiveAction.wide.getModifierAgainst(ServeAction.body),
            -0.3,
          );
        });

        test('neutral receive gives +0.3 bonus (correct anticipation)', () {
          expect(
            ServeReceiveAction.neutral.getModifierAgainst(ServeAction.body),
            0.3,
          );
        });

        test('tLine receive gives -0.3 penalty', () {
          expect(
            ServeReceiveAction.tLine.getModifierAgainst(ServeAction.body),
            -0.3,
          );
        });
      });

      group('against ServeAction.tLine', () {
        test('wide receive gives -0.6 penalty (wrong side)', () {
          expect(
            ServeReceiveAction.wide.getModifierAgainst(ServeAction.tLine),
            -0.6,
          );
        });

        test('neutral receive gives -0.3 penalty (slight miss)', () {
          expect(
            ServeReceiveAction.neutral.getModifierAgainst(ServeAction.tLine),
            -0.3,
          );
        });

        test('tLine receive gives +0.3 bonus (correct anticipation)', () {
          expect(
            ServeReceiveAction.tLine.getModifierAgainst(ServeAction.tLine),
            0.3,
          );
        });
      });
    });
  });
}
