import 'package:flutter_test/flutter_test.dart';
import 'package:tennis_strategy_game/models/actions/serve_action.dart';

void main() {
  group('ServeAction', () {
    group('cost values', () {
      test('wide serve has cost of -0.3', () {
        expect(ServeAction.wide.cost, equals(-0.3));
      });

      test('body serve has cost of -0.1', () {
        expect(ServeAction.body.cost, equals(-0.1));
      });

      test('tLine serve has cost of -0.3', () {
        expect(ServeAction.tLine.cost, equals(-0.3));
      });
    });

    group('enum values', () {
      test('has exactly 3 values', () {
        expect(ServeAction.values.length, equals(3));
      });

      test('contains all expected values', () {
        expect(
          ServeAction.values,
          containsAll([ServeAction.wide, ServeAction.body, ServeAction.tLine]),
        );
      });
    });
  });
}
