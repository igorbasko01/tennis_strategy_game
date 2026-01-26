import 'package:flutter_test/flutter_test.dart';
import 'package:tennis_strategy_game/models/shot_calculation.dart';

void main() {
  group('ShotCalculation', () {
    group('total getter', () {
      test('calculates sum of skill, actionCost, and randomFactor', () {
        const calculation = ShotCalculation(
          skill: 0.5,
          actionCost: -0.3,
          randomFactor: 0.1,
        );

        expect(calculation.total, closeTo(0.3, 0.0001));
      });

      test('handles all positive values', () {
        const calculation = ShotCalculation(
          skill: 0.7,
          actionCost: 0.0,
          randomFactor: 0.2,
        );

        expect(calculation.total, closeTo(0.9, 0.0001));
      });

      test('handles negative total correctly', () {
        const calculation = ShotCalculation(
          skill: 0.2,
          actionCost: -0.3,
          randomFactor: -0.2,
        );

        expect(calculation.total, closeTo(-0.3, 0.0001));
      });

      test('matches design doc example: Serve Wide with skill 0.5', () {
        // From design doc: Serve total: 0.5 - 0.3 + 0 = 0.2
        const calculation = ShotCalculation(
          skill: 0.5,
          actionCost: -0.3,
          randomFactor: 0.0,
        );

        expect(calculation.total, closeTo(0.2, 0.0001));
      });
    });

    group('equality', () {
      test('two calculations with same values are equal', () {
        const calc1 = ShotCalculation(
          skill: 0.5,
          actionCost: -0.3,
          randomFactor: 0.1,
        );
        const calc2 = ShotCalculation(
          skill: 0.5,
          actionCost: -0.3,
          randomFactor: 0.1,
        );

        expect(calc1, equals(calc2));
      });

      test('two calculations with different values are not equal', () {
        const calc1 = ShotCalculation(
          skill: 0.5,
          actionCost: -0.3,
          randomFactor: 0.1,
        );
        const calc2 = ShotCalculation(
          skill: 0.5,
          actionCost: -0.3,
          randomFactor: 0.2,
        );

        expect(calc1, isNot(equals(calc2)));
      });
    });
  });

  group('AnticipationCalculation', () {
    group('total getter', () {
      test(
        'calculates sum of skill, anticipationModifier, and randomFactor',
        () {
          const calculation = AnticipationCalculation(
            skill: 0.5,
            anticipationModifier: 0.3,
            randomFactor: 0.1,
          );

          expect(calculation.total, closeTo(0.9, 0.0001));
        },
      );

      test('handles negative modifier correctly', () {
        const calculation = AnticipationCalculation(
          skill: 0.5,
          anticipationModifier: -0.6,
          randomFactor: 0.0,
        );

        expect(calculation.total, closeTo(-0.1, 0.0001));
      });

      test('matches design doc example: Receive Wide against Serve Wide', () {
        // From design doc: Receive total: 0.5 + 0.3 + 0 = 0.8
        const calculation = AnticipationCalculation(
          skill: 0.5,
          anticipationModifier: 0.3,
          randomFactor: 0.0,
        );

        expect(calculation.total, closeTo(0.8, 0.0001));
      });

      test(
        'matches design doc example: Receive Neutral against Serve Wide',
        () {
          // From design doc: Receive total: 0.5 - 0.3 + 0 = 0.2
          const calculation = AnticipationCalculation(
            skill: 0.5,
            anticipationModifier: -0.3,
            randomFactor: 0.0,
          );

          expect(calculation.total, closeTo(0.2, 0.0001));
        },
      );

      test('matches design doc example: Receive T-Line against Serve Wide', () {
        // From design doc: Receive total: 0.5 - 0.6 + 0 = -0.1
        const calculation = AnticipationCalculation(
          skill: 0.5,
          anticipationModifier: -0.6,
          randomFactor: 0.0,
        );

        expect(calculation.total, closeTo(-0.1, 0.0001));
      });
    });

    group('equality', () {
      test('two calculations with same values are equal', () {
        const calc1 = AnticipationCalculation(
          skill: 0.5,
          anticipationModifier: 0.3,
          randomFactor: 0.1,
        );
        const calc2 = AnticipationCalculation(
          skill: 0.5,
          anticipationModifier: 0.3,
          randomFactor: 0.1,
        );

        expect(calc1, equals(calc2));
      });

      test('two calculations with different values are not equal', () {
        const calc1 = AnticipationCalculation(
          skill: 0.5,
          anticipationModifier: 0.3,
          randomFactor: 0.1,
        );
        const calc2 = AnticipationCalculation(
          skill: 0.5,
          anticipationModifier: -0.3,
          randomFactor: 0.1,
        );

        expect(calc1, isNot(equals(calc2)));
      });
    });
  });
}
