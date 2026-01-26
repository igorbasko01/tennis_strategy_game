# 🎾 Tennis Strategy

A **simultaneous turn-based strategy game** simulating the tactical depth of tennis through position and prediction.

## 🎮 Concept

Outsmart your opponent by choosing your shots and anticipating theirs. Both players lock in their decisions simultaneously before the turn is revealed, creating intense mind-games and strategic depth.

### Key Features

- **Simultaneous execution phases** - Both players choose actions at the same time
- **Bundled action system** - Select both your attack and anticipation in one turn
- **Skill-based resolution** - Outcomes determined by skill, shot difficulty, and prediction accuracy

## 🏗️ Project Structure

```
lib/
├── main.dart                 # App entry point and title screen
└── models/
    ├── models.dart           # Barrel export for all models
    ├── player.dart           # Player with skill attribute
    ├── point_result.dart     # Point outcome tracking
    ├── shot_calculation.dart # Formula breakdown for debugging
    ├── actions/
    │   ├── serve_action.dart         # Serve types (Wide, Body, T-Line)
    │   ├── serve_receive_action.dart # Serve receive anticipation
    │   ├── attack_action.dart        # Rally attacks (Cross-Court, etc.)
    │   └── defend_action.dart        # Rally defense anticipation
    └── turn/
        ├── server_choice.dart   # Server's bundled decision
        ├── receiver_choice.dart # Receiver's bundled decision
        └── rally_choice.dart    # Rally exchange decision
```

## 🚀 Getting Started

### Prerequisites

- Flutter SDK (3.10+)
- Android Studio or VS Code with Flutter extension
- Android emulator or physical device

### Running the App

```bash
# Get dependencies
flutter pub get

# Run on connected device/emulator
flutter run

# Run tests
flutter test
```

## 📖 Design Document

For detailed game mechanics and formulas, see the [Tennis Strategy Design Document](docs/tennis_strategy_design.md).

## 🧪 Testing

The project includes comprehensive unit tests for all data models:

```bash
# Run all tests
flutter test

# Run with coverage
flutter test --coverage
```

## 📝 License

This project is for educational and personal use.
