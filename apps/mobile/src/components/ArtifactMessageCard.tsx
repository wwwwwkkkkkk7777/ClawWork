import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { ArtifactResult } from "@clawwork/shared-types";
import { tokens } from "../theme/tokens";

const kindLabelMap: Record<ArtifactResult["artifact"]["kind"], string> = {
  excel: "Excel",
  pdf: "PDF",
  docx: "DOCX"
};

const kindHintMap: Record<ArtifactResult["artifact"]["kind"], string> = {
  excel: "表格已整理完成",
  pdf: "文档已生成完成",
  docx: "可编辑文档已生成"
};

export function ArtifactMessageCard(props: {
  artifact: ArtifactResult["artifact"];
  onDownload?: (url: string) => void;
}) {
  const { artifact } = props;

  const handleDownload = () => {
    if (!artifact.downloadUrl) return;
    if (props.onDownload) {
      props.onDownload(artifact.downloadUrl);
      return;
    }

    void Linking.openURL(artifact.downloadUrl);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{kindLabelMap[artifact.kind]}</Text>
        </View>
        <Text style={styles.hint}>{kindHintMap[artifact.kind]}</Text>
      </View>

      <Text style={styles.fileName}>{artifact.fileName}</Text>
      <Text style={styles.preview}>{artifact.previewText}</Text>

      <Pressable
        accessibilityLabel="download artifact"
        onPress={handleDownload}
        style={styles.downloadButton}
      >
        <Text style={styles.downloadText}>下载文件</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: tokens.radius.cardLg,
    padding: 18,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
    gap: 10
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.chip,
    backgroundColor: tokens.colors.accentSoft
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: tokens.colors.accent
  },
  hint: {
    flex: 1,
    fontSize: 12,
    textAlign: "right",
    color: tokens.colors.textSecondary
  },
  fileName: {
    fontSize: 18,
    fontWeight: "800",
    color: tokens.colors.text
  },
  preview: {
    fontSize: 14,
    lineHeight: 22,
    color: tokens.colors.textSecondary
  },
  downloadButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: tokens.radius.chip,
    backgroundColor: tokens.colors.accent
  },
  downloadText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff"
  }
});
