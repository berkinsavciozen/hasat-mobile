import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { brand } from "@/lib/core/design/tokens";
import { useReducedMotion } from "@/lib/native/useReducedMotion";

/** A quiet, dependency-free seed-to-seedling loop for the cold-start screen. */
export function SeedlingLoader() {
  const reduceMotion = useReducedMotion();
  const growth = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) {
      growth.stopAnimation();
      growth.setValue(1);
      return;
    }

    growth.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(growth, {
          toValue: 1,
          duration: 760,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(160),
        Animated.timing(growth, {
          toValue: 0,
          duration: 140,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [growth, reduceMotion]);

  const seedOpacity = growth.interpolate({
    inputRange: [0, 0.24, 0.4, 1],
    outputRange: [1, 1, 0, 0],
  });
  const stemScale = growth.interpolate({
    inputRange: [0, 0.22, 0.72, 1],
    outputRange: [0.08, 0.08, 1, 1],
  });
  const leafScale = growth.interpolate({
    inputRange: [0, 0.5, 0.82, 1],
    outputRange: [0.05, 0.05, 1, 1],
  });
  const sproutOpacity = growth.interpolate({
    inputRange: [0, 0.2, 0.42, 1],
    outputRange: [0, 0, 1, 1],
  });

  return (
    <View
      style={styles.frame}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="seedling-loader"
    >
      <Animated.View
        style={[
          styles.seed,
          {
            opacity: seedOpacity,
            transform: [{ rotate: "-18deg" }, { scale: seedOpacity }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.stem,
          {
            opacity: sproutOpacity,
            transform: [{ scaleY: stemScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.leaf,
          styles.leftLeaf,
          {
            opacity: sproutOpacity,
            transform: [{ rotate: "38deg" }, { scale: leafScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.leaf,
          styles.rightLeaf,
          {
            opacity: sproutOpacity,
            transform: [{ rotate: "-38deg" }, { scale: leafScale }],
          },
        ]}
      />
      <View style={styles.soil} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 56,
    height: 56,
    position: "relative",
  },
  seed: {
    position: "absolute",
    left: 21,
    top: 35,
    width: 14,
    height: 9,
    borderRadius: 7,
    backgroundColor: brand.saffron,
  },
  stem: {
    position: "absolute",
    left: 26,
    top: 12,
    width: 4,
    height: 32,
    borderRadius: 2,
    backgroundColor: brand.sage,
  },
  leaf: {
    position: "absolute",
    top: 18,
    width: 16,
    height: 9,
    borderRadius: 9,
    backgroundColor: brand.sage,
  },
  leftLeaf: {
    left: 13,
  },
  rightLeaf: {
    right: 13,
  },
  soil: {
    position: "absolute",
    left: 15,
    bottom: 8,
    width: 26,
    height: 2,
    borderRadius: 1,
    backgroundColor: brand.hmuted,
  },
});
