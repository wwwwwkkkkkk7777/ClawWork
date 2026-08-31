import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PendingAttachment } from "../store/taskStore";
import { tokens } from "../theme/tokens";

const statusLabels: Record<PendingAttachment["status"], string> = {
  uploading: "上传中",
  uploaded: "已完成",
  failed: "失败"
};

export function PendingFileCard(props: {
  attachment: PendingAttachment;
  onRemove: () => void;
}) {
  const { attachment } = props;

  return (
    <View style={styles.card}>
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.filename}>
          {attachment.filename}
        </Text>
        <Text style={styles.meta}>
          {statusLabels[attachment.status]} · {attachment.mimeType}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={`remove ${attachment.filename}`}
        onPress={props.onRemove}
        style={styles.removeButton}
      >
        <Text style={styles.removeText}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: tokens.radius.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border
  },
  body: {
    flex: 1,
    gap: 2
  },
  filename: {
    fontSize: 13,
    fontWeight: "700",
    color: tokens.colors.text
  },
  meta: {
    fontSize: 11,
    color: tokens.colors.textMuted
  },
  removeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.colors.surfaceMuted
  },
  removeText: {
    fontSize: 14,
    fontWeight: "700",
    color: tokens.colors.text
  }
});
