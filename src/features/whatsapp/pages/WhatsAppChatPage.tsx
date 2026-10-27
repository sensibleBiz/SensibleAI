import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spin } from "antd";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import type { RootState } from "@/app/store";
import { whatsappChatApi } from "../api/whatsappChatApi";
import type { WhatsAppMessageLog } from "../types/types";
import ChatList from "./ChatList";
import ChatWindow from "./ChatWindow";
import WhatsAppCategorySelectPage from "./WhatsAppCategorySelectPage";
import {
  getWhatsAppCategorizedChats,
  getWhatsAppCategoryStatsForChats,
  getWhatsAppCategoryFromParam,
  getWhatsAppCategoryLabel,
  WHATSAPP_CATEGORY_PARAM,
} from "./whatsappCategories";

const HISTORY_DAYS = 30;
const INITIAL_PAGE_SIZE = 50;
const OLDER_PAGE_SIZE = 25;
const historyCutoff = () => Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000;

const mergeChats = (...lists: WhatsAppMessageLog[][]) => {
  const byId = new Map<string, WhatsAppMessageLog>();
  lists.flat().forEach((chat) => byId.set(chat.id, { ...byId.get(chat.id), ...chat }));
  return [...byId.values()].sort((left, right) => (right.updatedDateTimeMili ?? right.createdDateTimeMili ?? 0) - (left.updatedDateTimeMili ?? left.createdDateTimeMili ?? 0));
};

export default function WhatsAppChatPage() {
  const outletId = useSelector((state: RootState) => state.appState.outletInfo?.id);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCategory = getWhatsAppCategoryFromParam(searchParams.get(WHATSAPP_CATEGORY_PARAM));
  const [allChats, setAllChats] = useState<WhatsAppMessageLog[]>([]);
  const [selectedChat, setSelectedChat] = useState<WhatsAppMessageLog | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const markedRead = useRef(new Set<string>());

  const categorized = useMemo(() => getWhatsAppCategorizedChats(allChats), [allChats]);
  const categoryStats = useMemo(() => getWhatsAppCategoryStatsForChats(allChats), [allChats]);
  const chats = selectedCategory ? categorized[selectedCategory] : [];

  useEffect(() => {
    if (!outletId) { setError("Outlet ID not found"); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError(null); setAllChats([]); setNextCursor(null); setSelectedChat(null); markedRead.current.clear();
    void whatsappChatApi.list({ outletId, startDate: historyCutoff(), limit: INITIAL_PAGE_SIZE }, controller.signal)
      .then((result) => { setAllChats(result.items); setNextCursor(result.nextCursor); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Failed to load chats"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [outletId]);

  useEffect(() => {
    setSelectedChat((current) => current ? chats.find((chat) => chat.id === current.id) ?? chats[0] ?? null : chats[0] ?? null);
  }, [chats]);

  const markChatAsRead = useCallback(async (chat: WhatsAppMessageLog) => {
    if (!outletId || markedRead.current.has(chat.id)) return;
    markedRead.current.add(chat.id);
    const optimistic = { ...chat, isRead: true, unreadCount: 0, lastReadAt: new Date().toISOString(), lastReadAtMili: Date.now() };
    setAllChats((current) => current.map((item) => item.id === chat.id ? optimistic : item));
    setSelectedChat((current) => current?.id === chat.id ? optimistic : current);
    try {
      const updated = await whatsappChatApi.markRead(outletId, chat.id);
      setAllChats((current) => current.map((item) => item.id === chat.id ? updated : item));
    } catch (reason) {
      markedRead.current.delete(chat.id);
      setError(reason instanceof Error ? reason.message : "Unable to mark the chat as read");
    }
  }, [outletId]);

  useEffect(() => { if (selectedChat) void markChatAsRead(selectedChat); }, [markChatAsRead, selectedChat]);

  const loadMore = useCallback(async () => {
    if (!outletId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await whatsappChatApi.list({ outletId, startDate: historyCutoff(), limit: OLDER_PAGE_SIZE, cursor: nextCursor });
      setAllChats((current) => mergeChats(current, result.items));
      setNextCursor(result.nextCursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to load older chats");
    } finally { setLoadingMore(false); }
  }, [loadingMore, nextCursor, outletId]);

  if (loading) return <div className="flex h-[calc(100vh-96px)] items-center justify-center bg-[#f0f2f5]"><Spin size="large" /></div>;
  if (error && allChats.length === 0) return <div className="flex h-[calc(100vh-96px)] items-center justify-center bg-[#f0f2f5]"><div className="text-center"><p className="mb-3 text-red-600">{error}</p><button onClick={() => window.location.reload()} className="rounded-lg bg-[#008069] px-4 py-2 text-white">Refresh Page</button></div></div>;
  if (!selectedCategory) return <WhatsAppCategorySelectPage loading={false} stats={categoryStats} onSelectCategory={(category) => setSearchParams({ [WHATSAPP_CATEGORY_PARAM]: category })} />;

  return <div className="flex h-[calc(100dvh-88px)] min-h-0 overflow-hidden bg-[#f0f2f5] md:h-[calc(100vh-96px)]">
    <div className={`${selectedChat ? "hidden md:flex" : "flex"} w-full flex-col border-r border-gray-300 md:w-[35%] md:min-w-[280px] md:max-w-[400px] lg:w-[30%]`}>
      <ChatList chats={chats} selectedChatId={selectedChat?.id} categoryLabel={getWhatsAppCategoryLabel(selectedCategory)} onSelectChat={(chat) => { setSelectedChat(chat); void markChatAsRead(chat); }} onBackToCategories={() => setSearchParams({})} hasMoreChats={Boolean(nextCursor)} loadingMoreChats={loadingMore} onLoadMoreChats={loadMore} />
    </div>
    <div className={`${selectedChat ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
      <ChatWindow
        chat={selectedChat ?? undefined}
        outletId={outletId!}
        onBack={() => setSelectedChat(null)}
        onConversationUpdated={(updated) => {
          setAllChats((current) => mergeChats(current, [updated]));
          setSelectedChat(updated);
        }}
      />
    </div>
  </div>;
}
