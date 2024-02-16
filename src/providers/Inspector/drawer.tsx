import {
	mdiArrowLeftBold,
	mdiClose,
	mdiCodeJson,
	mdiDelete,
	mdiMagnify,
	mdiRefresh,
	mdiSwapVertical,
} from "@mdi/js";

import { useEffect, useMemo, useState } from "react";
import { ActionIcon, Button, Center, Drawer, Group, Modal, Paper, Tabs, Text, TextInput } from "@mantine/core";
import { useIsLight } from "~/hooks/theme";
import { useStable } from "~/hooks/stable";
import { Icon } from "~/components/Icon";
import { Spacer } from "~/components/Spacer";
import { HistoryHandle } from "~/hooks/history";
import { ModalTitle } from "~/components/ModalTitle";
import { getSurreal } from "~/util/surreal";
import { themeColor } from "~/util/mantine";
import { useDisclosure, useInputState } from "@mantine/hooks";
import { RelationsTab } from "./tabs/relations";
import { ContentTab } from "./tabs/content";
import { useSaveable } from "~/hooks/save";

const DEFAULT_RECORD: ActiveRecord = {
	isEdge: false,
	exists: false,
	initial: "",
	inputs: [],
	outputs: []
};

interface ActiveRecord {
	isEdge: boolean;
	exists: boolean;
	initial: string;
	inputs: [];
	outputs: [];
}

export interface InspectorDrawerProps {
	opened: boolean;
	history: HistoryHandle<any>;
	onClose: () => void;
	onRefresh: () => void;
}

export function InspectorDrawer({ opened, history, onClose, onRefresh }: InspectorDrawerProps) {
	const [isDeleting, isDeletingHandle] = useDisclosure();
	const [currentRecord, setCurrentRecord] = useState<ActiveRecord>(DEFAULT_RECORD);
	const [recordId, setRecordId] = useInputState('');
	const [recordBody, setRecordBody] = useState('');
	
	const isLight = useIsLight();
	const inputColor = themeColor(currentRecord.exists ? "surreal" : "red");

	const isBodyValid = useMemo(() => {
		try {
			const parsed = JSON.parse(recordBody);

			if (typeof parsed !== "object") {
				throw new TypeError("Invalid JSON");
			}

			return true;
		} catch {
			return false;
		}
	}, [recordBody]);

	const saveHandle = useSaveable({
		valid: isBodyValid,
		track: {
			recordBody
		},
		onRevert(original) {
			setRecordBody(original.recordBody);
		},
		onSave() {
			saveRecord();
		}
	});

	const fetchRecord = useStable(async (id: string) => {
		const surreal = getSurreal();

		if (!surreal) {
			return;
		}

		const contentQuery = `SELECT * FROM ONLY ${id}`;
		const inputQuery = `SELECT VALUE <-? FROM ONLY ${id}`;
		const outputsQuery = `SELECT VALUE ->? FROM ONLY ${id}`;

		const [
			{ result: content },
			{ result: inputs},
			{ result: outputs}
		] = await surreal.query(`${contentQuery};${inputQuery};${outputsQuery}`);

		const formatted = JSON.stringify(content, null, 4);

		setRecordId(id);
		setCurrentRecord({
			isEdge: !!content?.in && !!content?.out,
			exists: !!content,
			initial: formatted,
			inputs,
			outputs
		});

		if (content) {
			setRecordBody(formatted);
		}

		saveHandle.track();
	});

	const refreshRecord = useStable(() => {
		if (history.current) {
			fetchRecord(history.current);
		}
	});

	const saveRecord = useStable(async () => {
		const surreal = getSurreal();

		if (!surreal) {
			return;
		}

		await surreal.query(`UPDATE ${history.current} CONTENT ${recordBody}`);

		refreshRecord();
		onRefresh();
	});

	const gotoRecord = useStable((e: any) => {
		if (e.type === "keydown" && (e as KeyboardEvent).key !== "Enter") {
			return;
		}

		history.push(recordId);
	});

	const handleDelete = useStable(async () => {
		const surreal = getSurreal();

		if (!surreal) {
			return;
		}

		await surreal.query(`DELETE ${history.current}`);

		history.clear();

		onRefresh();
		onClose();
	});

	useEffect(() => {
		if (history.current) {
			fetchRecord(history.current);
		}
	}, [history.current]);

	return (
		<Drawer
			opened={opened}
			onClose={onClose}
			position="right"
			withCloseButton={false}
			trapFocus={false}
			size="lg"
		>
			<Group mb="md" gap="sm">
				<ModalTitle>
					<Icon left path={mdiMagnify} />
					Record inspector
				</ModalTitle>

				<Spacer />

				<Group align="center">
					{history.canPop && (
						<ActionIcon
							onClick={history.pop}
							title="Go to previous record"
						>
							<Icon path={mdiArrowLeftBold} />
						</ActionIcon>
					)}

					<ActionIcon onClick={refreshRecord} title="Refetch record">
						<Icon path={mdiRefresh} />
					</ActionIcon>

					<ActionIcon
						disabled={!currentRecord.exists}
						onClick={isDeletingHandle.open}
						title="Delete record (Hold shift to force)"
					>
						<Icon path={mdiDelete} />
					</ActionIcon>

					<ActionIcon onClick={onClose} title="Close inspector">
						<Icon color="light.4" path={mdiClose} />
					</ActionIcon>
				</Group>
			</Group>
		
			<TextInput
				mb="xs"
				value={recordId}
				onBlur={gotoRecord}
				onKeyDown={gotoRecord}
				onChange={setRecordId}
				onFocus={(e) => e.target.select()}
				placeholder="table:id"
				rightSectionWidth={76}
				rightSection={
					currentRecord.isEdge && (
						<Paper
							title="This record is an edge"
							bg={isLight ? "light.0" : "light.6"}
							c={isLight ? "light.6" : "white"}
							radius="xl"
							px="xs"
						>
							Edge
						</Paper>
					)
				}
				styles={() => ({
					input: {
						color: inputColor,
						borderColor: inputColor,
						fontFamily: "JetBrains Mono",
						fontSize: 14,
						height: 42,
					},
				})}
			/>

			{currentRecord.exists ? (
				<Tabs defaultValue="content">
					<Tabs.List grow>
						<Tabs.Tab value="content">
							Content
							<Icon path={mdiCodeJson} size={0.85} right />
						</Tabs.Tab>
						<Tabs.Tab value="relations">
							Relations
							<Icon path={mdiSwapVertical} size={0.85} right />
						</Tabs.Tab>
					</Tabs.List>

					<Tabs.Panel value="content">
						<ContentTab
							value={recordBody}
							saveHandle={saveHandle}
							onChange={setRecordBody}
						/>
					</Tabs.Panel>

					<Tabs.Panel value="relations">
						<RelationsTab
							isLight={isLight}
							inputs={currentRecord.inputs}
							outputs={currentRecord.outputs}
							onOpen={history.push}
						/>
					</Tabs.Panel>
				</Tabs>
			) : (
				<Center my="xl">
					<Text c={isLight ? "light.7" : "light.3"}>
						Record not found in database
					</Text>
				</Center>
			)}

			<Modal
				opened={isDeleting}
				onClose={isDeletingHandle.close}
				title={<ModalTitle>Are you sure?</ModalTitle>}>
				<Text c={isLight ? "light.6" : "light.1"}>
					You are about to delete this record. This action cannot be undone.
				</Text>
				<Group mt="lg">
					<Button onClick={isDeletingHandle.close} color={isLight ? "light.5" : "light.3"} variant="light">
						Close
					</Button>
					<Spacer />
					<Button color="red" onClick={handleDelete}>
						Delete
					</Button>
				</Group>
			</Modal>
		</Drawer>
	);
}