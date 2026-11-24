import { useEffect, useId, useRef, useState } from "react";
import {
	MODULE_GROUPS,
	modulesInGroup,
	type ModuleType,
} from "./modules";

type Props = {
	onAdd: (type: ModuleType) => void;
};

export default function AddMenu({ onAdd }: Props) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const menuId = useId();

	useEffect(() => {
		if (!open) return;
		const onPointer = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		window.addEventListener("pointerdown", onPointer);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("pointerdown", onPointer);
			window.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<div className="synth-add" ref={rootRef}>
			<button
				type="button"
				className={`synth-add__btn${open ? " is-open" : ""}`}
				aria-expanded={open}
				aria-controls={menuId}
				onClick={() => setOpen((v) => !v)}
			>
				<span className="synth-add__plus" aria-hidden>
					+
				</span>
				Add module
			</button>

			{open && (
				<div className="synth-add__menu" id={menuId} role="menu">
					{MODULE_GROUPS.map((group) => {
						const items = modulesInGroup(group.id);
						if (items.length === 0) return null;
						return (
							<section key={group.id} className="synth-add__group">
								<h3 className="synth-add__group-label">{group.label}</h3>
								{items.map((mod) => (
									<button
										key={mod.type}
										type="button"
										role="menuitem"
										className="synth-add__item"
										onClick={() => {
											onAdd(mod.type);
											setOpen(false);
										}}
									>
										<span className="synth-add__item-top">
											<span className="synth-add__item-name">{mod.label}</span>
											<span className="synth-add__item-short">{mod.short}</span>
										</span>
										<span className="synth-add__item-about">{mod.about}</span>
									</button>
								))}
							</section>
						);
					})}
				</div>
			)}
		</div>
	);
}
