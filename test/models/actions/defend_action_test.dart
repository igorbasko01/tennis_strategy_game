import 'package:flutter_test/flutter_test.dart';
import 'package:tennis_strategy_game/models/actions/attack_action.dart';
import 'package:tennis_strategy_game/models/actions/defend_action.dart';

void main() {
  group('DefendAction', () {
    group('getModifierAgainst', () {
      group('against AttackAction.crossCourt', () {
        test('crossCourt defend gives +0.3 bonus (correct anticipation)', () {
          expect(
            DefendAction.crossCourt.getModifierAgainst(AttackAction.crossCourt),
            0.3,
          );
        });

        test('downTheLine defend gives -0.6 penalty (wrong side)', () {
          expect(
            DefendAction.downTheLine.getModifierAgainst(
              AttackAction.crossCourt,
            ),
            -0.6,
          );
        });

        test('centerDeep defend gives -0.3 penalty', () {
          expect(
            DefendAction.centerDeep.getModifierAgainst(AttackAction.crossCourt),
            -0.3,
          );
        });

        test('dropShot defend gives -0.6 penalty', () {
          expect(
            DefendAction.dropShot.getModifierAgainst(AttackAction.crossCourt),
            -0.6,
          );
        });
      });

      group('against AttackAction.downTheLine', () {
        test('crossCourt defend gives -0.6 penalty (wrong side)', () {
          expect(
            DefendAction.crossCourt.getModifierAgainst(
              AttackAction.downTheLine,
            ),
            -0.6,
          );
        });

        test('downTheLine defend gives +0.3 bonus (correct anticipation)', () {
          expect(
            DefendAction.downTheLine.getModifierAgainst(
              AttackAction.downTheLine,
            ),
            0.3,
          );
        });

        test('centerDeep defend gives -0.1 penalty (close enough)', () {
          expect(
            DefendAction.centerDeep.getModifierAgainst(
              AttackAction.downTheLine,
            ),
            -0.1,
          );
        });

        test('dropShot defend gives -0.3 penalty', () {
          expect(
            DefendAction.dropShot.getModifierAgainst(AttackAction.downTheLine),
            -0.3,
          );
        });
      });

      group('against AttackAction.centerDeep', () {
        test('crossCourt defend gives -0.3 penalty', () {
          expect(
            DefendAction.crossCourt.getModifierAgainst(AttackAction.centerDeep),
            -0.3,
          );
        });

        test('downTheLine defend gives -0.3 penalty', () {
          expect(
            DefendAction.downTheLine.getModifierAgainst(
              AttackAction.centerDeep,
            ),
            -0.3,
          );
        });

        test('centerDeep defend gives +0.3 bonus (correct anticipation)', () {
          expect(
            DefendAction.centerDeep.getModifierAgainst(AttackAction.centerDeep),
            0.3,
          );
        });

        test('dropShot defend gives -0.3 penalty', () {
          expect(
            DefendAction.dropShot.getModifierAgainst(AttackAction.centerDeep),
            -0.3,
          );
        });
      });

      group('against AttackAction.dropShot', () {
        test('crossCourt defend gives -0.3 penalty', () {
          expect(
            DefendAction.crossCourt.getModifierAgainst(AttackAction.dropShot),
            -0.3,
          );
        });

        test('downTheLine defend gives -0.3 penalty', () {
          expect(
            DefendAction.downTheLine.getModifierAgainst(AttackAction.dropShot),
            -0.3,
          );
        });

        test('centerDeep defend gives -0.3 penalty', () {
          expect(
            DefendAction.centerDeep.getModifierAgainst(AttackAction.dropShot),
            -0.3,
          );
        });

        test('dropShot defend gives +0.6 bonus (higher bonus for reading)', () {
          expect(
            DefendAction.dropShot.getModifierAgainst(AttackAction.dropShot),
            0.6,
          );
        });
      });
    });
  });
}
