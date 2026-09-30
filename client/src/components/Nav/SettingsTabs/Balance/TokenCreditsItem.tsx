import React from 'react';
import { useTranslation } from 'react-i18next';
import { Label, InfoHoverCard, ESide } from '@librechat/client';
import { formatCreditsAsCurrency } from '~/utils';
import { useLocalize } from '~/hooks';

interface TokenCreditsItemProps {
  tokenCredits?: number;
}

const TokenCreditsItem: React.FC<TokenCreditsItemProps> = ({ tokenCredits }) => {
  const localize = useLocalize();
  const { i18n } = useTranslation();

  return (
    <div className="flex items-center justify-between">
      {/* Left Section: Label */}
      <div className="flex items-center space-x-2">
        <Label className="font-light">{localize('com_nav_balance')}</Label>
        <InfoHoverCard side={ESide.Bottom} text={localize('com_nav_info_balance')} />
      </div>

      <span className="text-sm font-medium text-text-primary" role="note">
        {formatCreditsAsCurrency(tokenCredits ?? 0, i18n.resolvedLanguage)}
      </span>
    </div>
  );
};

export default TokenCreditsItem;
