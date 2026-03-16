export type RouteInput = {
  text: string;
  fileIds: string[];
};

export type RouteResult = {
  taskType: "document_summary" | "meeting_minutes" | "email_draft" | "weekly_report";
  toneStyle: "default" | "formal";
  needFileParse: boolean;
};

const meetingMinutesKeywords = ["纪要", "会议纪要"];
const emailKeywords = ["邮件", "邮箱", "email", "mail"];
const reportKeywords = ["周报", "汇报"];

export function routeByRules(input: RouteInput): RouteResult {
  const text = input.text.trim().toLowerCase();
  const needFileParse = input.fileIds.length > 0;

  if (meetingMinutesKeywords.some((keyword) => text.includes(keyword))) {
    return { taskType: "meeting_minutes", toneStyle: "default", needFileParse };
  }

  if (emailKeywords.some((keyword) => text.includes(keyword))) {
    return { taskType: "email_draft", toneStyle: "formal", needFileParse };
  }

  if (reportKeywords.some((keyword) => text.includes(keyword))) {
    return { taskType: "weekly_report", toneStyle: "formal", needFileParse };
  }

  return { taskType: "document_summary", toneStyle: "default", needFileParse };
}
