import type { QuizGroup } from "../quiz";
import QuizGroupSection from "./QuizGroupSection";

type Props = {
	quizGroups: QuizGroup[];
};

function App({ quizGroups }: Props) {
	return (
		<table id="layout">
			<tr>
				<td id="header" colSpan={2} className="marquee">
					<span>PHPerKaigi 2025 デジタルサーカス株式会社トークン問題</span>
				</td>
			</tr>
			<tr>
				<td id="sidebar">
					<h2>メニュー</h2>
					<ul>
						<li>
							<a href="">ホーム</a>
						</li>
						<li>
							<a
								href="https://github.com/nsfisis/PHPerKaigi2024-tokens"
								target="_blank"
							>
								トークン問題2024
							</a>
						</li>
						<li>
							<a
								href="https://github.com/nsfisis/PHPerKaigi2023-tokens"
								target="_blank"
							>
								トークン問題2023
							</a>
						</li>
						<li>
							<a
								href="https://github.com/nsfisis/PHPerKaigi2022-tokens"
								target="_blank"
							>
								トークン問題2022
							</a>
						</li>
						<li className="hidden">ここにトークンはないよ</li>
					</ul>
				</td>
				<td id="content">
					<main>
						<p>
							PHPerKaigi 2025 の PHPer チャレンジ企画において、
							<a href="https://www.dgcircus.com/">デジタルサーカス株式会社</a>
							から出題するトークン問題です (作問{" "}
							<a href="https://x.com/nsfisis">@nsfisis</a>)。
						</p>
						<p>
							それぞれの問題に、PHP の標準関数がひとつ設定されています。
							好きな引数を渡すと実行されます。その実行結果を見て、何の関数かを当ててください。
						</p>
						{quizGroups.map((group) => (
							<QuizGroupSection key={group.label} quizGroup={group} />
						))}
					</main>
				</td>
			</tr>
		</table>
	);
}

export default App;
