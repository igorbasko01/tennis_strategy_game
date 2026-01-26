import 'package:flutter_test/flutter_test.dart';
import 'package:tennis_strategy_game/models/actions/attack_action.dart';

void main() {
  group('AttackAction', () {
    group('cost values', () {
      test('crossCourt has cost of -0.2', () {
        expect(AttackAction.crossCourt.cost, equals(-0.2));
      });

      test('downTheLine has cost of -0.3', () {
        expect(AttackAction.downTheLine.cost, equals(-0.3));
      });

      test('centerDeep has cost of -0.1', () {
        expect(AttackAction.centerDeep.cost, equals(-0.1));
      });

      test('dropShot has cost of -0.3', () {
        expect(AttackAction.dropShot.cost, equals(-0.3));
      });
    });

    group('enum values', () {
      test('has exactly 4 values', () {
        expect(AttackAction.values.length, equals(4));
      });

      test('contains all expected values', () {
        expect(
          AttackAction.values,
          containsAll([
            AttackAction.crossCourt,
            AttackAction.downTheLine,
            AttackAction.centerDeep,
            AttackAction.dropShot,
          ]),
        );
      });
    });
  });
}
