import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { ArtifactMessageCard } from "../components/ArtifactMessageCard";

describe("ArtifactMessageCard", () => {
  it("renders artifact metadata and opens the download url", async () => {
    const openUrlSpy = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValueOnce(undefined as never);

    render(
      <ArtifactMessageCard
        artifact={{
          kind: "excel",
          fileName: "weekly-report.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          downloadUrl: "https://example.com/weekly-report.xlsx",
          previewText: "已整理为可下载表格"
        }}
      />
    );

    expect(screen.getByText("Excel")).toBeTruthy();
    expect(screen.getByText("weekly-report.xlsx")).toBeTruthy();
    expect(screen.getByText("已整理为可下载表格")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("download artifact"));

    expect(openUrlSpy).toHaveBeenCalledWith(
      "https://example.com/weekly-report.xlsx"
    );
  });
});
