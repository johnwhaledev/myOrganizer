# myOrganizer

**Offline document organizer for Android.**
No cloud. No background processes you didn't ask for. Your files stay on your device.

---

## What it does

myOrganizer has three tools:

### Smart Organizer
Pick a folder → the app reads filenames and document content → classifies each file into your custom categories using keyword matching → renames files with a consistent format (`[CAT]_YYYYMMDD_originalname`) → you review every move before anything is applied.

### Space Saver
Pick a folder or select files → the app groups by size, then by MD5 hash → shows you exact duplicates → pre-selects all but the most recent copy → you confirm what to delete.

### Brain
Define your own categories (e.g. `WRK`, `INV`, `MED`) with keywords. The Smart Organizer uses these to classify your documents. Files that don't match any category go to a `[TO_REVIEW]/` folder for manual inspection.

---

## Privacy

- 100% offline — no network requests, no analytics, no telemetry
- All processing happens on-device
- Storage: AsyncStorage (local only)
- No permissions requested beyond file access for the folders you explicitly pick

---

## Build from source

**Requirements:** Node.js 20+, Android SDK, JDK 17+

```bash
cd frontend
npm install
npx expo prebuild --platform android
```

For a release APK you need a signing keystore. Create `frontend/android/keystore.properties`:

```properties
storeFile=your-keystore.jks
storePassword=your-password
keyAlias=your-alias
keyPassword=your-password
```

Then build:

```bash
cd frontend/android
./gradlew assembleRelease
```

Output: `frontend/android/app/build/outputs/apk/release/app-release.apk`

> **CMake note (Windows):** the React Native native build requires CMake 3.28+ to avoid the Windows 260-character path limit. Install from [cmake.org](https://cmake.org/download/) and add `cmake.dir=C\:\\path\\to\\cmake` to `frontend/android/local.properties`.

---

## Stack

- React Native 0.81 / Expo SDK 54
- Expo Router (file-based navigation)
- AsyncStorage (local persistence)
- expo-document-picker, expo-file-system
- Ubuntu + Ubuntu Mono fonts

---

## License

MIT
