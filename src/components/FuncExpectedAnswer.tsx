import type { Quiz } from "../quiz";
import { execPHP } from "../exec_php";
import React, { useState, useEffect } from "react";
import { useDebounce } from "use-debounce";

type Props = {
	quiz: Quiz;
};

function FuncExpectedAnswer({ quiz }: Props) {
	const [argument, setArgument] = useState<string>("123");
	const [debouncedArgument] = useDebounce(argument, 1000);
	const [result, setResult] = useState<string>("");
	const [loading, setLoading] = useState<boolean>(true);

	const handleArgumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setArgument(e.target.value);
	};

	useEffect(() => {
		if (debouncedArgument === "") {
			setResult("<empty>");
			return;
		}

		setLoading(true);
		setResult("");

		const code = `
      function f($x) {
        return ${quiz.func}($x);
      }
      try {
        var_dump(f(${debouncedArgument}));
      } catch (\\Throwable $e) {
        echo $e->getMessage(), PHP_EOL;
      }
    `;

		execPHP(code).then((result) => {
			const output = result.stdout + result.stderr;
			setResult(output.replaceAll(quiz.func, "<answer is masked>"));
			setLoading(false);
		});
	}, [debouncedArgument, quiz.func]);

	return (
		<div>
			<code>
				{`f(`}
				<input type="text" value={argument} onChange={handleArgumentChange} />
				{`)`}
			</code>
			は <code>{loading ? "running..." : result}</code> を返す。
		</div>
	);
}

export default FuncExpectedAnswer;
