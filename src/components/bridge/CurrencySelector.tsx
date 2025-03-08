
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AddressPlaceholder } from "@/components/bridge/AddressPlaceholder";
import { Clock, Search, ArrowDownUp, AlertCircle } from "lucide-react";
import { Currency } from "@/types/bridge";
import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { Skeleton } from "@/components/ui/skeleton";

interface CurrencySelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onAmountChange?: (value: string) => void;
  amount?: string;
  estimatedAmount?: string;
  isCalculating?: boolean;
  timeRemaining?: string | null;
  availableCurrencies: Currency[];
  isLoadingCurrencies: boolean;
  isReceiveSide?: boolean;
  borderColor?: string;
  exchangeRate?: {
    rate: string;
    usdValue: string;
    invert?: boolean;
  } | null;
  minMaxAmounts?: {
    min: string;
    max: string;
  };
  formatNumberWithCommas?: (value: string | number) => string;
}

export const CurrencySelector = ({
  label,
  value,
  onChange,
  onAmountChange,
  amount,
  estimatedAmount,
  isCalculating,
  timeRemaining,
  availableCurrencies,
  isLoadingCurrencies,
  isReceiveSide = false,
  borderColor,
  exchangeRate,
  minMaxAmounts,
  formatNumberWithCommas = (val) => val.toString(),
}: CurrencySelectorProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<number | null>(null);
  const [showMinMaxInfo, setShowMinMaxInfo] = useState(false);

  // Add effect to animate min/max amounts appearance
  useEffect(() => {
    if (isTyping || isAmountFocused) {
      setShowMinMaxInfo(true);
    } else {
      const timer = setTimeout(() => {
        setShowMinMaxInfo(false);
      }, 300); // Delay hiding to allow for animation
      return () => clearTimeout(timer);
    }
  }, [isTyping, isAmountFocused]);

  const handleAmountChange = (value: string) => {
    if (!onAmountChange) return;

    const regex = /^\d*\.?\d*$/;
    if (value === "" || regex.test(value)) {
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }

      setIsTyping(true);

      const timeout = setTimeout(() => {
        setIsTyping(false);
      }, 1500);

      setTypingTimeout(timeout as unknown as number);

      onAmountChange(value);
    }
  };

  const filteredCurrencies = availableCurrencies.filter((currency) =>
    isReceiveSide ? currency.recv === 1 : currency.send === 1
  );

  const searchedCurrencies = filteredCurrencies.filter((currency) => {
    if (!searchTerm) return true;

    const search = searchTerm.toLowerCase();
    return (
      currency.name?.toLowerCase().includes(search) ||
      currency.code?.toLowerCase().includes(search) ||
      currency.coin?.toLowerCase().includes(search) ||
      currency.network?.toLowerCase().includes(search)
    );
  });

  useEffect(() => {
    if (filteredCurrencies.length > 0 && !value) {
      if (!isReceiveSide) {
        const btc = filteredCurrencies.find((c) => c.code === "BTC");
        const eth = filteredCurrencies.find((c) => c.code === "ETH");
        const highPriorityCurrency = filteredCurrencies.sort(
          (a, b) => (b.priority || 0) - (a.priority || 0)
        )[0];

        onChange(
          btc?.code ||
            eth?.code ||
            highPriorityCurrency?.code ||
            filteredCurrencies[0].code ||
            ""
        );
      } else {
        const usdt = filteredCurrencies.find((c) => c.code?.includes("USDT"));
        const usdc = filteredCurrencies.find((c) => c.code?.includes("USDC"));
        const eth = filteredCurrencies.find((c) => c.code === "ETH");
        const highPriorityCurrency = filteredCurrencies.sort(
          (a, b) => (b.priority || 0) - (a.priority || 0)
        )[0];

        onChange(
          usdt?.code ||
            usdc?.code ||
            eth?.code ||
            highPriorityCurrency?.code ||
            filteredCurrencies[0].code ||
            ""
        );
      }
    }
  }, [filteredCurrencies, value, onChange, isReceiveSide]);

  const borderStyle = borderColor
    ? {
        borderColor: borderColor,
        borderWidth: "2px",
      }
    : {};

  const selectedCurrency = availableCurrencies.find((c) => c.code === value);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
    };
  }, [typingTimeout]);

  const formatDisplayValue = (value: string | number): string => {
    if (!formatNumberWithCommas) return value.toString();
    return formatNumberWithCommas(value);
  };

  return (
    <div className="flex-1">
      <label className="block text-sm font-medium mb-2 text-gray-300 text-center sm:text-left">
        {label}
      </label>
      <div className="relative">
        <Select
          value={value}
          onValueChange={onChange}
          disabled={isLoadingCurrencies}
          onOpenChange={setIsOpen}
        >
          <SelectTrigger
            className="h-[3.5rem] sm:h-[4.5rem] px-3 sm:px-4 bg-secondary/30 text-sm sm:text-base transition-all duration-200"
            style={borderStyle}
          >
            <div className="flex flex-col w-full">
              <div className="pointer-events-none flex items-center w-full h-10">
                <SelectValue
                  placeholder={
                    isLoadingCurrencies ? (
                      <Icon icon="eos-icons:three-dots-loading" width={50} />
                    ) : (
                      "Select currency"
                    )
                  }
                  className="[&>span]:w-auto [&>span]:!flex-none"
                />
              </div>
              <div className="flex items-center justify-between w-full mt-1">
                <span className="pointer-events-none text-xs text-gray-400 text-left">
                  {isReceiveSide ? "You'll receive:" : "You'll send:"}
                </span>
                {isReceiveSide ? (
                  <span className="pointer-events-none text-sm flex items-center gap-1">
                    {isCalculating ? (
                      <span className="text-gray-400">Calculating...</span>
                    ) : estimatedAmount ? (
                      <>
                        <span>{formatDisplayValue(estimatedAmount)}</span>
                        {/* {timeRemaining && (
                          <span className="flex items-center text-xs text-[#0FA0CE]">
                            <Clock className="h-3 w-3 mr-1" />
                            {timeRemaining}s
                          </span>
                        )} */}
                      </>
                    ) : (
                      "0.00"
                    )}
                  </span>
                ) : (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="relative z-10"
                  >
                    <Input
                      type="text"
                      placeholder="0.00"
                      value={amount || ""}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      onFocus={() => setIsAmountFocused(true)}
                      onBlur={() => setIsAmountFocused(false)}
                      className="w-24 h-6 px-1 text-right bg-transparent border-none text-sm focus:outline-none focus:ring-0"
                    />
                  </div>
                )}
              </div>
            </div>
          </SelectTrigger>
          <SelectContent className="border border-white/10 max-h-[300px] glass-card">
            <div className="sticky top-0 px-2 py-2 bg-background/80 backdrop-blur-md z-10">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search currency..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {exchangeRate && value && (
              <div className="px-3 py-2 border-b border-white/10 text-xs text-muted-foreground">
                <div className="flex items-center gap-1 mb-1">
                  <ArrowDownUp className="h-3 w-3" />
                  <span>Exchange Rate</span>
                </div>
                <div className="font-mono">
                  {exchangeRate.invert
                    ? `1 ${selectedCurrency?.code} = ${formatDisplayValue(exchangeRate.rate)} ${
                        isReceiveSide ? "send" : "receive"
                      } ($${exchangeRate.usdValue})`
                    : `1 ${isReceiveSide ? "send" : "receive"} = ${
                        formatDisplayValue(exchangeRate.rate)
                      } ${selectedCurrency?.code} ($${exchangeRate.usdValue})`}
                </div>
              </div>
            )}

            {isLoadingCurrencies ? (
              <SelectItem value="loading" disabled>
                <Icon icon="eos-icons:three-dots-loading" />
              </SelectItem>
            ) : searchedCurrencies.length === 0 ? (
              <SelectItem value="none" disabled>
                {searchTerm
                  ? "No matching currencies"
                  : "No currencies available"}
              </SelectItem>
            ) : (
              searchedCurrencies
                .sort((a, b) => (b.priority || 0) - (a.priority || 0))
                .map((currency) => (
                  <SelectItem key={currency.code} value={currency.code || ""}>
                    <div className="flex items-center gap-2">
                      {currency.logo ? (
                        <img
                          src={currency.logo}
                          alt={currency.name}
                          className="w-5 h-5 sm:w-6 sm:h-6 rounded-full"
                        />
                      ) : (
                        <div
                          className="w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ backgroundColor: currency.color || "#888" }}
                        >
                          {currency.coin?.substring(0, 1).toUpperCase() ||
                            currency.code?.substring(0, 1).toUpperCase()}
                        </div>
                      )}
                      <span>
                        {currency.name}
                        {currency.network &&
                          currency.network !== currency.coin && (
                            <span className="text-xs ml-1 text-muted-foreground">
                              [{currency.network}]
                            </span>
                          )}
                      </span>
                    </div>
                  </SelectItem>
                ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="h-14 mt-2">
        {!isReceiveSide && value && selectedCurrency && (
          <>
            {/* Animation container for min/max amount display */}
            <div 
              className={`transition-all duration-300 overflow-hidden ${
                showMinMaxInfo ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              {minMaxAmounts && (
                <div className="flex gap-2 mb-2">
                  <div className="bg-[#221F26] rounded-md px-2.5 py-1 text-xs">
                    <span className="text-[#FFA500]">min: </span>
                    <span className="font-mono text-gray-300">
                      {formatDisplayValue(minMaxAmounts.min)} {selectedCurrency.code}
                    </span>
                  </div>
                  <div className="bg-[#221F26] rounded-md px-2.5 py-1 text-xs">
                    <span className="text-[#FFA500]">max: </span>
                    <span className="font-mono text-gray-300">
                      {formatDisplayValue(minMaxAmounts.max)} {selectedCurrency.code}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Only show exchange rate when not showing min/max */}
            {(!showMinMaxInfo && exchangeRate && amount) ? (
              <div className="flex items-center text-xs text-gray-400 font-mono gap-1 flex justify-between transition-opacity duration-300">
                {!exchangeRate.rate ? (
                  <Skeleton className="h-4 w-32" />
                ) : (
                  <>
                    <span>
                      1 {selectedCurrency?.code} = {formatDisplayValue(exchangeRate.rate)}
                    </span>
                    <span>
                      {isReceiveSide ? "receive" : "send"}($
                      {exchangeRate.usdValue})
                    </span>
                  </>
                )}
              </div>
            ) : null}
          </>
        )}

        {isReceiveSide && value && exchangeRate && estimatedAmount && (
          <div className="mt-1 flex items-center text-xs text-gray-400 font-mono gap-1 justify-between">
            {!exchangeRate.rate ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <>
                <span>
                  1 {selectedCurrency?.code} = {formatDisplayValue(exchangeRate.rate)}
                </span>
                <span>
                  {isReceiveSide ? "receive" : "send"}(${exchangeRate.usdValue})
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
