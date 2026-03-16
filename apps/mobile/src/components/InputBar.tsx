import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export function InputBar(props: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
}) {
  return (
    <View style={styles.wrapper}>
      <TextInput
        placeholder="告诉我你想交给我的任务"
        value={props.value}
        onChangeText={props.onChangeText}
        style={styles.input}
      />
      <Pressable onPress={props.onSend} style={styles.button}>
        <Text style={styles.buttonText}>发送</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 12,
    marginTop: 20
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#d6d3d1",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff"
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: "#0f766e",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700"
  }
});
