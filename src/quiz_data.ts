import { QuizGroup } from "./quiz";

export const QUIZ_GROUPS: QuizGroup[] = [
	{
		label: "チュートリアル",
		quizzes: [
			{
				label: "Q1",
				func: "abs",
				message: "トークン1文字目「#」",
			},
		],
	},
	{
		label: "かんたん",
		quizzes: [
			{
				label: "Q2",
				func: "strlen",
				message: "トークン2文字目「W」",
			},
			{
				label: "Q3",
				func: "gettype",
				message: "トークン3文字目「E」",
			},
			{
				label: "Q4",
				func: "count",
				message: "トークン4文字目「❤」",
			},
		],
	},
	{
		label: "ふつう",
		quizzes: [
			{
				label: "Q5",
				func: "md5",
				message: "トークン5文字目「P」",
			},
			{
				label: "Q6",
				func: "strtoupper",
				message: "トークン6文字目「H」",
			},
			{
				label: "Q7",
				func: "array_keys",
				message: "トークン7文字目「P」。トークンはこれでおわり",
			},
		],
	},
	{
		label: "むずかしい",
		quizzes: [
			{
				label: "Q8",
				func: "str_rot13",
				message: "すごい！",
			},
			{
				label: "Q9",
				func: "metaphone",
				message: "すごい！",
			},
			{
				label: "Q10",
				func: "array_change_key_case",
				message: "すごい！",
			},
		],
	},
];
